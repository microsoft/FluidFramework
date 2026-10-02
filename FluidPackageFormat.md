# Fluid Package Format and Collaboration Establishment (Proposal)

> **Status:** Draft / exploratory. This document captures an initial proposal and is expected to iterate.

> **Scope:** This proposal covers the **package format and collaboration establishment**.
> It defines an interchange format for file creation, download/export, and upload/import, plus the application, Fluid runtime/loader, and service flow that establishes collaborative state from `.projection`-only content.
> The package format is intended to be service-independent; the service integration described here is scoped to ODSP, with no claim that other services will adopt it.
> It does not define or replace ODSP's internal at-rest storage mechanism, which remains service-owned and free to evolve independently.

> **Priority / rollout sequencing:** Creating a file in `.projection`-only form and then starting a collaborative session from it is the **must-have** capability this proposal exists to deliver.
> The primary creation workflow is an agentic harness writing the application's projection format without running Fluid or producing collaborative state.
> `getLatest` must expose that state, and the application must be able to establish `.collab` from it (§3.8).
> The same path also supports recovery after external edits invalidate existing `.collab`.
> Grouped inline summary content is the preferred bootstrap path for imported assets; referencing existing projection blobs through SPO is also required, but much lower priority (§3.8).
> Enable projection-first creation per application only after grouped `.blobs` support has saturated its clients, including summarizers (§3.8.1).
> Full round-trip fidelity of `.collab`, the checksum's exact wire format, `.ops` representation, and broader attachment/group unification are lower priority.
> That does not remove the need for end-to-end confidence in the full design before production rollout; shipping the initial pieces must not lock in a format that fails when the remaining pieces are added.

## 1. Motivation: portable files and collaboration establishment

ODSP's internal storage representation is service-owned, not a public interchange contract.
Fluid already has snapshot and pending-state serialization capabilities.
For example, [`captureFullContainerState`](packages/loader/container-loader/src/createAndLoadContainerUtils.ts) can capture a self-contained snapshot, referenced attachment content, and an operation tail for offline loading, subject to its documented limitations.
Those capabilities do not define the versioned, service-independent file format with non-Fluid-readable content proposed here.
The missing contract is an artifact that can be exported, emailed, archived, or imported without depending on ODSP's internal storage representation.

**Projection-first creation is a primary goal, not only an export or recovery scenario.**
An agentic harness should be able to create a document by writing the application's projection format alone.
It does not need a Fluid runtime, a summary, or a previous collaborative document.
The application must then be able to start a collaborative session from that valid projection.
The harness writes a `.fluid` ZIP containing the package manifest and `.projection`, with no `.collab`; it does not upload unwrapped application files as an alternative input format.
A single package from initial creation is important in particular because the file format must support sensitivity labels before collaboration starts, as well as afterward.

As Fluid-based documents become first-class files (not just live collaborative sessions), we need a **real, versioned, portable package format** that:

- Supports projection-only creation by non-Fluid tools, followed by application-driven establishment of collaborative state.
- Supports sensitivity-label protection for the file throughout projection-only and collaborative use.
- Can be produced from a live container's summary at a point in time.
- Can be fully round-tripped back into a live, resumable Fluid container when `.collab` is preserved (no data loss of the collaborative state captured in the package).
  Reconstruction from an externally edited `.projection` is a separate, potentially lossy path (§3.7).
- Is independent of any particular driver/service — a generic container format, with service-specific behavior layered on top (e.g. ODSP choosing to natively recognize/promote part of it).
- Is understandable, at least in part, by tools that are not Fluid-aware.

The package format is distinct from the live summary/snapshot wire protocol, which remains an internal, incremental, service-specific transport optimized for collaboration, not portability.
The establishment flow in this proposal requires application, loader/runtime, and service integration; it does not replace that live transport with the package format.

## 2. The need for a "projection" inside the package

A Fluid document's collaborative state (`.protocol` + `.app`) is only meaningful to a Fluid-aware runtime. Opened by anything else (a generic file browser, a preview pane, search indexing, an older/foreign client), it is opaque.

For a Fluid file to be a good citizen as a *file* — previewable, indexable, searchable, renderable without invoking the full Fluid runtime — the package needs a part that is:

- **Application-defined and importable**: a representation a capable application can use to establish collaborative state.
  A tool such as an agentic harness can author it directly to create a new document.
  For an existing collaborative document, the application generates it from a particular summarized state; it need not include later operations (§3.9).
- **Useful outside Fluid**: it can include HTML, images, or other application files that non-Fluid tools can consume.
  A preview alone is not sufficient unless an application-supported import path into a collaborative model exists.
- **Top-level and primary**: the thing a generic tool encounters first when opening the package, analogous to how OOXML/EPUB designate a primary part.
- **Optional and ignorable**: a summary/package producer may omit the projection, and a collaborative reader may ignore its contents.
  It is not required for live collaboration when the recorded state also has no projection.
  Removing a previously recorded projection is a different case and follows the consistency rules in §3.7.

We refer to this part as **`.projection`**.
It is the application-facing representation for both non-Fluid authoring and consumption.
When `.collab` is present and valid, it preserves the full captured collaborative state alongside the projection.
When a file is created from the projection alone, there is no prior collaborative state to preserve or recover.

Note: making `.projection` *natively* rendered by a specific service (e.g. SharePoint preview) is a service-side capability, separate from — and larger in scope than — defining the package format itself. The package format must support the scenario without requiring it.

**A concrete motivating use case for `.projection` being independently fetchable**: a read API could accept hints indicating which parts the caller needs, such as `.projection` plus `.collab`, or `.projection` alone.
This avoids fetching `.collab/.blobs` when only the rendering is needed.
Selecting only text and excluding images within `.projection` would additionally require a projection-aware selection contract; independence from `.collab` does not itself identify which application files are images or which can be omitted.
Such a partial response is not the complete, self-contained projection required in the exported package (§3.3).

## 3. Proposal

### 3.1 Container format

Use a **zip container with a manifest**, following the precedent of OOXML (.docx/.pptx), ODF, and EPUB:

- Ubiquitous tooling support, random access to individual parts, streamable.
- A root `manifest.json` declares package format version, the set of top-level parts, and which part (if any) is "primary" for generic viewers.

**Projection-only creation uses this same package format.**
An agentic harness creates the ZIP and package manifest, then writes the application's files under `.projection`.
It does not need to generate `.collab`, summary metadata, or operations.
For example:

```
container.fluid  (zip)
├── manifest.json
│     { "packageFormatVersion": 1,
│       "parts": [".projection"],
│       "primaryPart": ".projection" }
└── .projection/
    └── index.html               ← illustrative application content
```

The initial upload is the `.fluid` package, not a loose HTML file or a directory of application assets.
Adding collaborative state later retains the same package-level model.
Sensitivity-label compatibility is required for both states (§3.6); using ZIP alone does not provide that capability.

With collaborative state present, the layout is:

```
container.fluid  (zip)
├── manifest.json                ← PACKAGE-FORMAT manifest (Fluid-defined, application-independent):
│                                    package version, set of top-level parts, primary-part pointer
├── .projection/                 ← application-specific, human/app-facing; real files, real names
│   ├── manifest.json               (OPTIONAL — only if the application's own projection format)
│   ├── index.html                  (or .png / .pdf / etc., app-defined)
│   └── media/
│       └── cover.png               (self-contained: app-chosen name, possibly a duplicate
│                                      of bytes that also live under .collab/.blobs/)
└── .collab/                     ← everything needed to resume live collaboration; nothing here
    │                                is meaningful without the rest of .collab
    ├── tree.json                  ← (Fluid-defined, application-independent):
    │                                 full tree shape + metadata (groupId, unreferenced, flags, etc.)
    │                                 + blob references by hash.
    ├── .ops/                      ← replay tail, if any, plus proposed historical retention (§3.2).
    │                                 Internal representation deliberately left unspecified.
    └── .blobs/
        ├── <hash-a>
        ├── <hash-b>
        └── ...
```

> **Naming note:** the top-level `manifest.json` and `.collab/tree.json` are both **package-format metadata defined by this proposal**, with fixed, Fluid-controlled schemas. Anything under `.projection/`, including a file that happens to also be named `manifest.json`, is **entirely application content**: its shape, meaning, and even whether it exists at all is up to the application, and Fluid/the package format place no interpretation on it. This distinction matters in practice, since applications commonly ship their own `manifest.json` (e.g. web app manifests) as part of their rendered output.

### 3.2 Top-level split: `.projection` vs `.collab` (with `.ops` and `.blobs` nested inside)

- `.collab` contains the collaborative state from today's `.protocol` + `.app`, with the replay tail and dependencies needed to resume at the declared export endpoint. `.ops` and `.blobs` live *inside* `.collab` rather than as top-level siblings, since both are purely collaboration-resumption plumbing — an op log to replay forward and the content store `tree.json` references by hash — and neither is meaningful without `.collab/tree.json`. A consumer that drops `.collab` entirely (keeping only `.projection`) drops all three together, which matches how tightly coupled they actually are.
- `.ops` = an operation log that advances the selected summary to a fixed export sequence number.
  If the summary represents sequence number `S` and the export endpoint is `E`, the replay tail must contain every sequenced operation in `(S, E]`, in order.
  **Invariant: the replay tail may be omitted only when `S = E`.**
  Both boundaries must be recorded; "latest" cannot remain a moving target while an export is assembled.
  The encoding and placement of this boundary metadata remain unspecified.
- `.projection` = application-defined, importable content that non-Fluid tools can author and consume.
  It uses real filenames and file contents, with no indirection into `.collab`.
  Its application-specific structure is not defined by the package format.
- `.projection` and `.collab` are top-level siblings in the package manifest; `.ops` and `.blobs` are siblings *within* `.collab`, not top-level.
  A collaborative reader can ignore the application-specific meaning of `.projection`, but must still honor its checksum binding (§3.7).
  A consumer interested only in the summarized state can read `.collab/tree.json` + `.collab/.blobs` without replaying `.ops`; it must not present that older state as the export endpoint or drop a required replay tail from a lossless re-export.
- **While `.collab` is valid, it is the source of truth and `.projection` is a derived view.**
  A generated projection can omit collaborative or application-model detail.
  An external edit can then introduce content that does not exist in the old `.collab`; the "derived view" relationship no longer holds for that edited projection.
  Rebuilding from it is an authority transition, not a lossless inverse of rendering (§3.7).
- **For projection-only creation, `.projection` is the initial source of truth.**
  The application establishes new collaborative state from it; it does not need an earlier `.collab` or evidence that Fluid generated the projection.

**Self-containment includes operation dependencies.**
An operation after the selected summary can reference an attachment uploaded separately; neither the summary nor the operation contains its bytes.
The exporter must include those payloads as well as content referenced by the summary.
The existing `captureFullContainerState` implementation collects attachment references from the operation tail before completing its capture.
Pending local changes that have not been sequenced are outside this replay-tail contract.

Retaining an additional 30 days of historical operations is proposed for offline support; its capture and retention rules remain to be specified.
Fluid's default 30-day session expiry is a different policy.
Resuming an offline client also depends on its base state, pending changes, identities, service lineage, and session lifetime; storing an operation history alone does not provide that guarantee.

### 3.2.1 `.collab` is a JSON manifest, not a literal file tree

A zip/folder tree has no native place for Fluid node metadata such as `groupId` and `unreferenced`.
Instead, `.collab/tree.json` describes named trees, named blob references into `.collab/.blobs/`, and node-level metadata.
It is based on Fluid's summary and snapshot models, but those are not interchangeable serialized schemas: `ISummaryTree` distinguishes inline blobs, attachments, and incremental handles, while `ISnapshotTree` maps names to child trees and blob IDs.
The package needs an explicit schema and conversions that preserve those distinctions.
Only `.collab/.blobs/` uses anonymous content-addressed filenames; logical tree and blob names remain necessary for runtime and DDS loading.

Note that blob *type* (summary blob vs. attachment blob) is a property of the blob itself, not of the tree — it is encoded in the hash/id used to address the blob under `.collab/.blobs/` (see §3.3), not as a separate field in `tree.json`.

### 3.3 Blob representation

A proposed rule for package content identity applies to both summary and attachment blobs: blob type is encoded as part of the package hash/id, not as separate tree metadata.
This defines package addressing, not ODSP's internal hash algorithm or a guarantee that package IDs equal service-issued IDs (§3.5).

| Concept | Scope | Derived from | Used for |
|---|---|---|---|
| **Hash** | Global | Content bytes + blob type (summary vs. attachment) | Identity, dedup, integrity, `.collab` addressing |
| **Projection filename** (e.g. `cover.png`) | Local to a single reference site | Application-chosen | Human/tool friendliness; extension can suggest a media type |

Consequences:

- Blob *type* must be recoverable from the package ID if no separate type field is stored.
  A readable type tag plus a digest could provide this; mixing a type tag only into a one-way hash distinguishes identities but does not reveal the type to a reader.
  The exact encoding remains open.
- `.collab/.blobs/<hash>` holds raw, extensionless bytes.
  `.collab/tree.json` preserves their logical reference names (§3.2.1), not human-facing media filenames.
- Human-facing filenames are chosen when `.projection` is assembled.
  The same bytes can have different filenames at different reference sites.
- This proposal does not require adding a media-type parameter to `uploadBlob()`.
  Applications can choose suitable filenames and projection metadata.
  A filename extension is a hint, not a complete media-type or generic-viewer dispatch contract.
- `.projection` is a self-contained, ordinary file tree: it duplicates bytes from `.collab/.blobs` as needed rather than referencing them, because there is no general way to decide which blobs are "shareable" vs "single-use" for dedup purposes — the same bytes can be a one-off asset in one document and a shared asset in another. This mirrors how any other "export to file" format behaves (e.g. saving a web page as HTML + files duplicates a shared logo across pages). **This self-containment is a hard requirement, not just the default**: `.projection`, as it appears in the package, must consist of ordinary, independently-openable files with no indirection into `.collab`. A producer is free to use a reference-by-hash into `.collab/.blobs` as an internal storage/transfer optimization, but it must materialize that reference into a real, self-contained file before it is exposed as part of `.projection` — otherwise a consumer that legitimately drops `.collab` (per §3.2) would be left with unresolvable references, defeating the entire point of `.projection` being independently consumable.

### 3.4 Protocol: where `.projection` comes from, and where it lives in the tree

**The proposed `.projection` representation uses ordinary summary objects.**
This describes how an already collaborative document refreshes its projection.
Initial projection-only creation is different: an external tool authors the application format directly, without executing a summary flow.
During live summarization, the projection representation can use incremental handles for unchanged content.
However, summary representation alone does not provide an application contribution point at `.app/.projection`.
The stock runtime owns the application-root summary, and ordinary data-store and distributed data structure (DDS) contributions are nested under `.channels`.
The projection-provider API, ownership, and invocation policy are intentionally left open.
The requirement is dependency-correct projection generation, not a particular application-level hook or DDS-based implementation.

The provider must also track all inputs to the rendering.
An unchanged summarizer node can return a prior handle without invoking its summary callback.
If a projection depends on another data store, changes in that source must invalidate the projection or otherwise cause its provider to run.
Ordinary incremental reuse does not supply this cross-store dependency tracking automatically.
Normal summarization supports asynchronous generation while inbound processing is paused; generation must not mutate the model or wait for operations that cannot be processed during that pause.
Initial/detached summary generation is synchronous, so asynchronous preparation must happen before that step.

Large projections need an explicit loading policy.
`loadingGroupId` is represented as `groupId` in summary/snapshot trees, and the current runtime coordinates group loading during data-store realization.
Tagging an arbitrary subtree does not by itself provide that runtime integration.
Also, the [snapshot-fetch contract](packages/common/driver-definitions/src/storage.ts) permits the service to include grouped content in the initial response.
Grouping can help reduce boot payloads, but excluding projection bytes from boot is not guaranteed by the tag alone.

**`.projection` should identify the state from which it was generated.**
For a SharedTree-based model with retained history, application metadata can include the source tree identity and revision ID alongside the summary sequence number.
A revision ID identifies a commit; it does not contain a diff.
Computing model changes still requires the relevant retained history or an application-provided diff representation.
A projection-only response does not automatically contain that history.
This provenance metadata remains application content, not a package-format-level field.

**Where `.projection` shows up in the tree is a separate, service-facing question**, and we have a preference plus a fallback:

- **Preferred shape**, from a pure Fluid/runtime perspective:

  ```
  (summary root)
  ├── .protocol
  └── .app
      └── .projection
  ```

  i.e. `.projection` would be a sub-tree of `.app`, alongside runtime-owned application state.
  This is a proposed contribution point, not an existing stock application API.

- **Fallback shape**, if the preferred shape isn't acceptable (e.g. to a service that wants a structural guarantee that `.projection` is always cleanly separable/extractable without parsing `.app` internals):

  ```
  (summary root)
  ├── .projection
  └── .collab
      ├── .protocol
      └── .app
  ```

  i.e. `.projection` is promoted to a top-level sibling, and everything else (including `.protocol`) is nested under `.collab` (consistent with §3.2/§3.2.1).

The first shape remains the preferred authoring shape; the package uses the top-level split in §3.2.
Export can materialize summary handles before separating those parts.
This does not require changing the live service's at-rest layout.
If a driver also changes the layout used for live incremental summaries, it must translate paths in summary handles, reconstruct the runtime's expected snapshot shape on reads, and preserve inherited group metadata.
An incremental upload can represent an entire ancestor with a handle, so finding `.projection` is not always a literal subtree move.
The provider and any live-layout adapter are separate integration work, not consequences of choosing the package layout.

### 3.5 Note: summary-blob vs. attachment-blob, and `loadingGroupId`

The package proposes preserving blob type in its content IDs (§3.3).
The ODSP driver distinguishes inline summary content from references to separately uploaded attachments, but exposes service blob IDs as opaque strings.
This repository does not establish the service's hash algorithm, cross-type deduplication behavior, or whether imported package IDs can remain unchanged.
Those service details need confirmation; package correctness must not assume them.

**Content addressing must preserve runtime-visible identities.**
BlobManager reads attachment IDs from snapshot entries, from the serialized `.redirectTable`, and from `blobAttach` operation metadata.
DDS content can also contain legacy handles based on those IDs.
Replacing only tree references with new hashes leaves these other references unchanged.
Round-trip fidelity therefore requires either a verified same-ID guarantee, an alias/translation layer, or a complete identity migration.
The mechanism and its import protocol are intentionally left open, pending service/runtime design and confirmation.
Full `.collab` round-trip support requires demonstrating that all runtime-visible references still resolve after import, including IDs embedded in serialized state and replayed operations.
This requirement does not prevent projection-first creation, which constructs fresh collaborative state rather than preserving prior collaborative identities (§3.7).

Separately, Fluid also has `loadingGroupId` (a property of a *sub-tree*, used to decide what gets fetched together — see `packages/runtime/runtime-utils/src/snapshotUtils.ts` and `summaryUtils.ts`), which is a different, coarser-grained mechanism solving a related problem (letting a service avoid eagerly shipping bytes it doesn't need yet). It's tempting to eventually unify the two — e.g. have the runtime mark the sub-tree that holds attachment-style blobs with a `groupId` and let that supersede the separate attachment-blob concept entirely, eliminating `ISummaryAttachment` as a type. However:

- This is a protocol-level change (BlobManager, GC, every driver), independent of and larger than the package format itself.
- It doesn't have to block or shape the package format — `.collab/tree.json` just needs to preserve whatever `groupId` metadata exists at the time a package is produced, whether or not the attachment-blob concept is eventually folded into it.
- The package format is a new feature; a service like ODSP can continue writing/reading its existing at-rest format for live collaboration (including legacy attachment-blob semantics) while independently adopting this package format for export/interop, so there's no forced coupling between the two migrations.

This broader `loadingGroupId` unification remains a future direction, outside v1.
It is distinct from the narrower bootstrap capability in §3.8: including imported asset bytes in a grouped summary subtree, with the runtime changes needed to use them.
That bootstrap path is in scope; removing `ISummaryAttachment` across Fluid is not a prerequisite.

### 3.6 Versioning and extensibility

- `manifest.json` carries a package format version; unknown top-level parts must be safely ignorable by readers.
- Export fully materializes the selected summary, resolving `ISummaryHandle`s and fetching omitted loading-group content.
  It includes the operation range and its attachment dependencies (§3.2), preserves binary bytes and node metadata, and writes content-addressed blobs.
  Import must preserve runtime-visible identities (§3.5).
  The summary/snapshot conversion and identity mapping need explicit contracts; they are not supplied by a tree walk alone.
  Importing preserved `.collab` is intended to retain ODSP's existing import/restore semantics for initializing collaboration.
  This proposal changes the interchange representation, not those service mechanics, whose implementation remains outside scope.
  Projection-based establishment creates fresh collaborative state and is covered separately in §3.8.
- **Sensitivity-label compatibility is required, including for projection-only files.**
  Creating a file, importing/exporting it, reading its projection, and establishing `.collab` must respect the applicable label and protection policy.
  Establishing collaboration must not discard that protection or require an unprotected intermediate file.
  The label metadata, encryption representation, and application/service integration are not specified here.
  Their placement must not be inferred from the ZIP layout, and support for the new format requires confirmation rather than an assumption that existing protection works unchanged.

### 3.7 Integrity: detecting edits made outside Fluid, via a checksum

`.collab` must be an exact, faithful representation of collaborative state — any external edit to it has to be detectable, since a Fluid-aware consumer cannot safely resume collaboration (replay ops, continue summarizing, etc.) against state it can't trust. At the same time, `.projection` is explicitly meant to be editable by non-Fluid-aware tools and workflows (e.g. a generic file-editing tool that only understands the rendered content, not the collaborative model) — and such edits are a *legitimate, supported* way to produce a new, valid Fluid package, not an error condition.

**Important scope note on the threat model**: what follows is a self-recorded checksum, not a cryptographic signature with an external trust anchor. It detects *accidental* or *incidental* modification of `.collab` by a tool that doesn't know to update/preserve it (e.g. a generic editor that only touches `.projection` and leaves `.collab`'s bytes alone, or a naive copy/re-zip that corrupts something). It does **not** protect against a party with intent to tamper: anyone able to rewrite package bytes can simply recompute and rewrite the checksum(s) too, so this mechanism should not be relied on for any adversarial/security guarantee. We call it a "signature" informally in discussion, but "checksum"/"consistency hash" is the more accurate term, and that's what it's meant to provide — self-consistency detection, not authenticity.

This motivates a **checksum** with separate collaboration and projection hashes.
The exact schema remains open.
The stored collaboration hash must be outside the payload it hashes; Appendix A illustrates placing it in the top-level `manifest.json`.

- **A hash of everything under `.collab`** (i.e. `.collab/tree.json`, `.collab/.blobs/*`, `.collab/.ops/*` — the whole collaboration-resumption bundle). This is the value checked to detect incidental modification of `.collab` itself. (Epoch is not part of `.collab`'s own state in this proposal — see §3.8 — so there is no exclusion to carve out here; the hash simply covers everything `.collab` contains.)
- **A hash of everything under `.projection`**.
  The checksum record associates this value with the collaboration payload, so readers can detect a change to the projection independently of a change to `.collab`.
  A reader does not need to inspect `.collab` to compare the projection bytes with their recorded hash.

SPO computes the current projection hash, using a distinct **no-projection value** when the part is absent, and compares it with the value recorded for `.collab`.
The record describes the projection present when the collaborative state was established or summarized, including legitimate absence.
An external upload must not replace this expected value with the new projection's hash before comparison, which would hide the change.
The concrete encoding of the no-projection value remains unspecified.

With these hashes, the two failure modes become separate comparisons:

- **`.collab`-modification detection**: recompute the collaboration hash and compare it with the stored value.
  On mismatch, **treat `.collab` as absent**, following the recovery policy proposed below.
  Recovery still depends on an available, importable projection and the establishment contract in §3.8.
- **`.projection`-drift detection**: compare the current projection hash or no-projection value with the recorded value.
  A match permits use of otherwise-valid `.collab`, including when both values indicate no projection.
  A mismatch invalidates `.collab` regardless of whether its own hash matches.
  If a current projection exists, it is the source for establishment (§3.8).
  If it was removed, there is no projection to import and the file is invalid.

These comparisons detect changes relative to the recorded payloads.
They do not identify who changed the content, prove semantic consistency, or establish authenticity.

**What this checksum does not prove.**
A passing projection comparison establishes that its bytes match the recorded projection hash.
It does not prove that the projection includes changes in the operation tail, that the producer rendered the model correctly, or that the package includes changes after its export endpoint.
Freshness relative to live collaborative state and byte drift relative to the recorded projection are different concerns (§3.9).

**Preferred no-op behavior:** reading and re-uploading content that SPO recognizes as unchanged, with no intervening file changes, should not create epoch or version-history churn.
Prefer comparison of package entry paths and uncompressed contents, so changes only to ZIP ordering, compression, or incidental archive timestamps can still count as a no-op.
This is a preference, not a required normalization rule: SPO owns the equivalence decision and may treat any archive-byte change, including reordering, as new content and process it as an overwrite.
Because the internal storage representation is not the package ZIP, neither logical-content nor archive-byte comparison follows automatically from the at-rest representation.
The chosen comparison must account for collaborative state and its operation tail, not just projection equality, and must respect meaningful protection metadata.
No-op handling and its concurrency precondition must not discard an intervening edit.
These are service-design considerations, not consequences of a checksum or an existing summary-upload precondition.

The checksum comparisons also let an external, non-Fluid-aware tool legitimately "take over" a file: it only needs to modify `.projection` — it does not need to understand or update `.collab`/`.blobs` at all, and may leave `.collab` untouched or delete it. Either way, the `.projection` hash comparison catches the drift and the stale `.collab` is never used once `.projection` has moved on.

**Every supported projection format must have an application-supported import path into collaborative state.**
This requirement applies both to projections generated by Fluid applications and to valid projections authored directly by tools such as agentic harnesses.
An importable projection need not have been derived from a previous `.collab`.
The conversion algorithm is application-owned and outside this document; its availability is a requirement of the proposal.
Import need not reproduce prior collaborative identities or history: the application can allocate new data-store and DDS identities.
This does not give that application exclusive authority to establish collaboration.
The application that calls `getLatest` receives the projection-only response and can choose to supply an initial summary.
Any application with the required read/write permissions that implements the Fluid protocol may do so; the service does not require it to match an application identity associated with the file.
The caller is responsible for interpreting the projection and producing suitable collaborative state.
No package-level application identifier or importer-discovery mechanism is required by this protocol.

Because `.projection` can be a lossy rendering (see §3.2), rebuilding `.collab` from an externally-edited `.projection` is a **best-effort, potentially lossy** reconstruction — it can lose collaborative-state detail that existed only in the old `.collab` and was never surfaced in `.projection` (e.g. in-flight session state, or data-model detail with no projected rendering). This is an accepted consequence of allowing non-Fluid-aware tools to edit `.projection` directly, not a defect in the rebuild mechanism specifically — it's structurally the same risk that already exists today whenever a file is externally replaced while a live collaboration session is still open against the old version. Applications that need changes to merge cleanly with live collaborative state, rather than risk this lossy fallback, should make those changes **through a headless Fluid client** (i.e. by driving the edit through an actual Fluid session, so it's properly merged into `.collab` as ops/summary) rather than by editing `.projection` directly. Editing `.projection` directly is best understood as a lossy, best-effort path for tools that have no other way to participate — not the primary way applications are expected to modify documents.

A direct consequence: **a package with no `.collab` section at all is a valid file.**
It has no live collaborative state yet, or that state was deliberately dropped or superseded.
Beginning collaboration requires an application capable of importing the projection, not merely a Fluid-aware client.
The opening application can perform that conversion itself or use its own importer.
Simply reading the projection does not require establishing collaboration.

**`.projection` is also optional (§2), so "treat `.collab` as absent" is not always recoverable.** If `.collab`'s hash check fails (or `.collab` is simply missing) and the package *also* has no `.projection`, there is nothing to rebuild `.collab` from — §3.8's recovery path only works when a valid `.projection` exists. A package with damaged/missing `.collab` and no `.projection` is a genuinely unrecoverable, broken file; a Fluid-aware client must surface this as a hard error rather than attempt recovery. (A package produced with neither a valid `.collab` nor any `.projection` at all is, in practice, a degenerate/invalid export — there was nothing to resume and nothing to render — and producers should avoid ever emitting one.)

**Omission and deletion are distinct.**
A valid `.collab` produced by a summary with no projection remains usable: the expected and current values both indicate absence.
Deleting a projection that the checksum record says was present does not satisfy that condition.
The proposed policy is to report that file as invalid, rather than silently use `.collab` after its projection binding no longer matches.

### 3.8 Mechanism: establishing `.collab` from projection-only creation or edits

The following proposed flow establishes collaborative state for a newly authored projection-only file, or re-establishes it after an external edit invalidates prior `.collab` (§3.7).
Projection-only creation does not depend on a previous summary or a preceding epoch change.
Establishment uses a file ETag/generation precondition and prioritizes grouped inline summary content for asset bootstrap.
Service enforcement, error/cache behavior, and the runtime integration for those assets still need definition.

1. **The recovery-establish API does not bump epoch.**
   This preserves the distinction between posting a summary and replacing a file.
   [`epochTracker.ts`](packages/drivers/odsp-driver/src/epochTracker.ts) documents restore and download/re-upload as disruptive epoch-changing operations; the no-op exception proposed in §3.7 needs separate service agreement.
   Existing clients must not continue their old collaborative session after replacement.
2. **Collaborative APIs report a distinguishable recovery-required state until `.collab` is established.**
   Projection reads and the recovery-establish API are intended exceptions.
   The preferred asset-bootstrap path includes bytes in the initial summary rather than requiring separate attachment uploads before establishment.
   Epoch mismatch alone cannot implement this state: a fresh client accepts the current epoch, and an old client's snapshot reads also undergo epoch validation.
   The current driver treats an overwrite-style error without an epoch mismatch as retryable coherency trouble.
   The error contract and a fresh recovery-reading context must therefore be specified independently of old-client invalidation.
3. **`getLatest` is extended with an explicit discriminator.**
   It returns either valid `.collab` (snapshot plus operations) or available `.projection` content.
   A projection-only response also carries an opaque file ETag/generation token bound to the state returned, even when the file has never had a summary.
   If neither usable representation exists, it reports an error (§3.7).
   The new response requires driver parsing, loader/host routing, cache behavior, and compatibility handling; it must not be passed to a loader expecting a normal snapshot.
   The calling application decides whether to consume the projection only or, with read/write permissions, supply an initial summary.
   The protocol does not discover, select, or launch an application to do that work.
4. **A service API accepts a fresh summary against the existing file.**
   Preserving epoch and the file's last-writer identity/timestamp are proposed requirements, not guarantees established by the existing upload code.
   The application must prepare its imported state and any required attachments before this summary can be committed.
   Any application with the required file read/write permissions and Fluid protocol support can submit it.
   No exclusive application-identity check is introduced; normal authorization, protection policy, summary validation, and concurrency preconditions still apply.
5. **Establishment must be conditional on the state that was read.**
   The caller submits the file ETag/generation token from its projection-only `getLatest` response with the initial summary.
   The service must atomically check that the token still identifies the current file state and that the file still requires establishment, then commit the summary.
   Only one competing reconstruction can establish `.collab`; an intervening projection edit or file replacement makes an older token ineligible.
   Successful establishment makes subsequent attempts with the old precondition fail, even though establishment does not bump epoch.
   This generation/state precondition is distinct from epoch and from the user-visible last-writer identity/timestamp.
   After a conflict, the client must obtain fresh state rather than reuse a cached projection-only response.
   If that read returns valid `.collab`, it uses the established state rather than submitting another initial summary.
   The retry behavior after an unknown commit outcome also needs definition.
6. **After successful establishment, normal collaborative APIs become available for the current generation.**
   This does not revive clients invalidated by an earlier file replacement.

**Service implementation to confirm.**
The file ETag/generation contract above is a proposal, not a claim about existing SPO behavior.
[`OdspSummaryUploadManager`](packages/drivers/odsp-driver/src/odspSummaryUploadManager.ts) uses `context.ackHandle` as its parent; `proposalHandle` is used for mismatch telemetry.
Its relay-session `If-Match` header is conditional, not present on every initial write.
The repository documents rejection of incorrect summary parents, but an absent parent alone cannot distinguish two projection-only generations.
[`createNewContainerOnExistingFile`](packages/drivers/odsp-driver/src/createFile/createNewContainerOnExistingFile.ts) already accepts a file ETag through `If-Match`.
That is a candidate for implementing the chosen contract, subject to confirmation of generation binding and atomic first-establishment semantics.
The exact token source, API fields, and service enforcement remain to be confirmed.

**Asset bootstrap uses two mechanisms, with different priorities.**
The existing ODSP new-empty-file workflow uploads attachments before its first summary.
That does not automatically supply recovery against an existing projection-only file: the current existing-file creation converter accepts inline blobs and trees, not attachment entries.
The proposal instead prioritizes these paths:

- **Primary: include asset bytes as ordinary summary blobs in a grouped subtree.**
  The application reads the projection assets and includes their bytes in the initial summary, committed under the generation precondition above.
  The existing-file converter already carries inline blob content and tree `groupId` metadata.
  The intended runtime direction is to mark the runtime's `.app/.blobs` subtree with a `groupId`, potentially on every summary, and support inline asset content there.
  This runtime subtree is distinct from the package's `.collab/.blobs` content pool.
  Adding the tag alone is insufficient: today's BlobManager emits `ISummaryAttachment` references and a redirect table containing storage IDs.
  The runtime must support the new representation through initial creation, handle resolution after loading, subsequent summaries, and garbage collection.
  It must also integrate loading for this grouped subtree; grouping alone neither registers handles nor guarantees exclusion from the initial snapshot (§3.4).
  This path is intended to be sufficient for initial rollout, subject to confirming these runtime changes and applicable summary-size limits.
- **Required, but much lower priority: let the initial summary reference blobs already in the file's `.projection`.**
  This requires SPO support; it is not an existing summary-handle capability established by this repository.
  References must resolve against the same file generation used for establishment, acquire usable runtime identities, and retain the bytes for as long as collaborative state needs them, independently of subsequent projection regeneration.
  This avoids requiring the client to upload those asset bytes again.
  The reference encoding and service implementation remain open.

Separate attachment staging is not the selected bootstrap design.
Neither path requires completing the broader attachment/group unification described in §3.5.

**Duplication and storage scope.**
The interchange package deliberately duplicates projection assets where needed for self-containment.
The primary bootstrap path uploads bytes already available in the projection; the lower-priority SPO reference capability can avoid that transfer.
The package does not prescribe ODSP's physical storage layout or deduplication implementation, and this repository does not establish that those uploads introduce zero additional stored bytes.

### 3.8.1 Rollout sequencing and first-rollout exit criteria

First, deploy clients that put a `groupId` on the runtime's `.app/.blobs` subtree and support reading and writing its inline asset content and existing attachment references.
After those versions have saturated an application's participating clients, including summarizers, enable projection-first creation for that application.
Do not enable the workflow for applications that have not completed this rollout.
This sequencing addresses compatibility without requiring a separate package-level compatibility gate.
Per-application enablement is deployment sequencing, not an application-identity restriction on the establishment API.

Before enabling the first rollout for an application, demonstrate these outcomes with the client and service implementation:

| Scenario | Required outcome |
|---|---|
| Projection-only creation and reads | An agentic harness creates a valid package with a manifest and `.projection`, without a previous summary or `.collab`. `getLatest` returns the projection and its generation token. Reading alone does not establish collaboration. |
| Asset import and collaborative use | Import binary assets, such as PNG images, as grouped inline summary content. Establish collaboration, edit with multiple clients, produce a subsequent summary, and reopen from the service with the expected collaborative state and unchanged asset bytes. Referenced assets remain readable. |
| Protection and authorization | Applicable sensitivity labels and protection remain enforced during creation, projection reads, establishment, and reopening, without an unprotected intermediate file. Establishment requires the file's read/write permissions; projection read access alone does not authorize it. |
| Competing importers | Two initial-summary submissions based on the same generation result in one establishment. The losing client obtains fresh state and uses the winner's `.collab`. Establishment preserves epoch and the file's last-writer identity/timestamp. |
| Intervening edit or replacement | A projection edit or file replacement between reading and establishment causes the stale submission to fail without replacing the newer content. Clients invalidated by a replacement cannot resume their old collaborative session after establishment. |
| Application rollout | Projection-first creation remains disabled until versions with the required grouped `.blobs` read/write support have saturated the application's participating clients, including summarizers. |

These criteria cover the first projection-to-collaboration rollout.
Full preserved-`.collab` round-trip support, the lower-priority SPO capability to reference existing projection blobs, and broader attachment/group unification remain separate milestones.

### 3.9 Out of scope: keeping `.projection` fresh for files at rest

This proposal covers the package format and collaboration establishment.
It deliberately does **not** describe the mechanism that keeps `.projection` from going stale relative to `.collab` while a document is at rest between collaboration sessions.

Concretely: once a collaboration session ends, `.collab` can have a trailing tail of ops sequenced after the last summary — ops that were applied to live collaborative state but never folded into a new summary (and therefore never reflected in `.projection`, which is only ever regenerated as part of producing a new summary). Until something explicitly closes that gap, `.projection` reflects the state as of the last summary, not the true latest state, even though `.collab` (summary + trailing `.ops`) is fully caught up.

Deciding when to produce a final summary is separate application/service work.
Today, the normal summary workflow requires a connected summarizer, proposal submission, and acknowledgement; ODSP's combined-summary upload also uses a connected flush path.
Publishing an accepted summary without a WebSocket session would require additional runtime/service capability, not just a scheduled headless application.
That capability remains outside this proposal.

The projection provider must ensure that a generated projection represents its declared source state, including dependency invalidation (§3.4).
The checksum only detects byte drift; it does not prove that the provider rendered the correct state.
This proposal does not mandate how promptly, or by what trigger, projection regeneration happens.

## 4. Open questions / follow-ups

1. Whether/when to pursue the broader `loadingGroupId` / attachment-blob unification described in §3.5 — tracked as a future direction, distinct from the in-scope grouped-summary bootstrap in §3.8.
2. The representation of `.ops`: encoding, batching/chunking, boundary metadata, and any historical-retention policy beyond the required replay range (§3.2).
   Two independent implementations cannot interoperate until these details are specified.
3. Checksum representation (§3.7): placement outside its own hashed payload, algorithm, encoding, binding of the two hashes, and canonicalization.
   This includes the distinct no-projection value; legitimate omission is allowed, while deletion of a recorded projection invalidates the file.
4. Projection-only client integration: expose the discriminated response to the calling application and let it optionally supply an initial summary.
   Application selection is not a protocol responsibility, and establishment is not restricted to a designated application identity.
5. Recovery concurrency and lifecycle (§3.8): service implementation of the chosen file ETag/generation precondition, error and cache contracts, and retry after an unknown commit outcome.
   Asset bootstrap needs runtime support for grouped inline summary content and, at much lower priority, the required SPO capability to reference existing projection blobs.
6. Blob identity preservation (§3.5): same-ID guarantees, aliases, or migration across package and service addressing.
   The mechanism remains open, but identity preservation is required before full `.collab` round-trip support.
7. The projection-provider API (§3.4): ownership, dependency invalidation, initial-summary preparation, loading behavior, and any live-layout adapter.
   The API and invocation policy are deliberately open; dependency-correct generation is required regardless of the implementation.
8. No-op uploads (§3.7): SPO's equivalence rule, concurrency handling, and service metadata/version-history effects.
   Logical-content comparison is preferred, but treating any archive-byte change as an overwrite is acceptable.
9. Sensitivity-label integration (§3.6): how the application and service preserve and enforce protection for projection-only packages, collaboration establishment, and import/export.
   Label support is required; its encoding and integration remain unspecified.

## Appendix A: Worked example — summary tree to package layout

This appendix illustrates how a simplified Fluid summary maps to the package layout described in §3.1–§3.3.
It is not a complete wire-format specification; runtime metadata and unresolved package fields are omitted as noted below.

### A.1 Simplified summary using the proposed projection contribution

Imagine a document with one data store (id `3f9a1c2e-...`, an illustrative opaque ID) containing a SharedTree and a DDS holding a cover-image reference, plus the proposed application-authored `.projection` contribution.
Data-store IDs need not be UUIDs; current generation also uses compact IDs.
For readability, this diagram omits `.channels` wrappers, DDS attributes, and BlobManager's runtime-root `.blobs` and redirect-table structures.
The attachment is drawn at its use site rather than its actual runtime summary location.
These omissions are illustrative only; a real export must preserve the runtime structures and identities described in §3.5.

```
SummaryTree (root)
├── .protocol                              (ISummaryTree: quorum, members, minimumSequenceNumber, ...)
│   └── attributes                         (ISummaryBlob: JSON — sequenceNumber, term, ...)
└── .app                                   (ISummaryTree)
    ├── 3f9a1c2e-...                       (ISummaryTree — one data store)
    │   ├── .component                     (ISummaryBlob: data store's own metadata/pkg info)
    │   ├── content                        (ISummaryTree — the SharedTree DDS)
    │   │   └── header                     (ISummaryBlob: JSON — SharedTree content {"revision": "r42", "nodes": [...]})
    │   └── cover                          (ISummaryTree — a DDS holding an attachment reference)
    │       └── blob                       (ISummaryAttachment: id = "a1b2c3...")   ← points at an uploaded attachment blob
    └── .projection                        (ISummaryTree — app-authored rendering; see §3.4 preferred shape;
        │                                     groupId "projection" illustrates the intended grouping; see §3.4 limitations)
        ├── index.html                      (ISummaryBlob: "<html>...cover.png...</html>")
        └── cover.png                       (ISummaryBlob: raw PNG bytes — duplicated from the attachment above, per §3.3)
```

Notes on this shape:
- `.protocol` and `.app` are exactly today's existing summary split (§3.2) — nothing new here.
- `cover`'s `ISummaryAttachment` is a reference to a blob uploaded out-of-band via the attachment-blob upload path (not inline `ISummaryBlob` content) — this is today's existing summary-blob-vs-attachment-blob distinction (§3.5).
- `.projection/cover.png` is a plain `ISummaryBlob` with the **same bytes** as the attachment blob referenced by `cover/blob` — this is the duplication §3.3/§3.8 call out as acceptable within the interchange package.
- `.projection` here uses the **proposed preferred shape** from §3.4, not a current stock application contribution API.

### A.2 Resulting package layout (`container.fluid`, a zip)

Producing a package (§3.1, §3.6) fully materializes the summary and its required dependencies, preserving runtime-visible identities.
This example has no operation tail (`S = E`).
It abbreviates typed content IDs as `h_...` and omits the unresolved identity-mapping representation; it is not a complete importable wire example.
The checksum is shown outside `.collab` to avoid hashing its own stored value.

```
container.fluid  (zip)
├── manifest.json
│     { "packageFormatVersion": 1,
│       "parts": [".projection", ".collab"],
│       "primaryPart": ".projection",
│       "checksum": { "collabHash": "h_9f...", "projectionHash": "h_7e..." } }
│
├── .projection/                                  ← extracted from the proposed .app/.projection
│   ├── index.html                                   during export (§3.4)
│   └── cover.png                                  ← real, duplicated bytes — an ordinary file, openable
│                                                      by anything, no indirection into .collab
│
└── .collab/
    ├── tree.json
    │     {
    │       "tree": {
    │         ".protocol": {
    │           "attributes": { "blob": "h_aa11..." }
    │         },
    │         ".app": {
    │           "3f9a1c2e-...": {
    │             ".component": { "blob": "h_bb22..." },
    │             "content": {
    │               "header": { "blob": "h_cc33..." }
    │             },
    │             "cover": {
    │               "blob": { "blob": "h_a1b2c3..." }                            ← §3.3/§3.5: type encoded
    │             }                                                                   in the abbreviated id
    │           }
    │         }
    │       }
    │     }
    │
    └── .blobs/
        ├── h_aa11...                              ← raw bytes of .protocol/attributes
        ├── h_bb22...                              ← raw bytes of .component
        ├── h_cc33...                              ← raw bytes of content/header (SharedTree content)
        └── h_a1b2c3...                             ← raw bytes of the cover attachment blob
                                                        (same bytes as .projection/cover.png, stored once here)
```

### A.3 Reading the mapping

| Summary tree node | Package location | Why |
|---|---|---|
| `.protocol/attributes` | `.collab/.blobs/h_aa11...`, referenced from `.collab/tree.json` | Logical name retained in `tree.json`; content addressed by hash (§3.2.1) |
| `.app/3f9a1c2e-.../.component` | `.collab/.blobs/h_bb22...` | Same — pure collaboration-resumption content |
| `.app/3f9a1c2e-.../content/header` | `.collab/.blobs/h_cc33...` | Same — this is the actual SharedTree document content; `.projection` is a *rendering* of it, not a substitute for it |
| `.app/3f9a1c2e-.../cover/blob` (illustrative attachment use site) | `.collab/.blobs/h_a1b2c3...` | Typed content ID, with runtime attachment identity also preserved (§3.3/§3.5) |
| `.app/.projection/index.html` | `.projection/index.html` | App-authored rendering, extracted during export (§3.4) — real name, no indirection |
| `.app/.projection/cover.png` | `.projection/cover.png` | Same bytes as `h_a1b2c3...`, but duplicated as a real, named file so `.projection` is self-contained (§3.3) |

The key takeaway: every piece of `.collab` content is addressed purely by hash and needs the rest of `.collab` to be meaningful; every piece of `.projection` is an ordinary, independently-openable file — even where (as with `cover.png`) it happens to carry the same bytes as something already present in `.collab/.blobs`.
