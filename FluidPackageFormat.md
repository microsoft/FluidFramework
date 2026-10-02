# Fluid Package Format (Proposal)

> **Status:** Draft / exploratory. This document captures an initial proposal and is expected to iterate.

> **Scope:** This is an **interchange/export format**: what ODSP produces when a file is downloaded/exported, and what it consumes when a file is uploaded/imported. It is **not** a description of, or a replacement for, ODSP's internal at-rest storage mechanism — that remains exactly as it is today: opaque, undocumented, and free to evolve independently. This proposal is scoped to ODSP specifically; no claim is made about other services adopting it.

> **Priority / rollout sequencing:** Supporting a `.projection`-only state — i.e. `getLatest` returning `.projection` content when `.collab` is absent/stale, and the ability to convert that state into a full collaborative session (§3.8) — is the **must-have** capability this proposal exists to deliver. Everything else described here (full round-trip fidelity of `.collab`, using this same interchange format for the live-collaboration at-rest encoding, the checksum/integrity mechanism's exact wire format, `.ops` internal representation, `loadingGroupId`/attachment-blob unification, etc.) is **lower priority**: useful and worth getting right eventually, but not blocking. That said, because this format needs to be validated against the *whole* stack (runtime, loader, ODSP driver, and service) before we can be confident it's actually correct, we likely do **not** want to ship the must-have pieces to production ahead of having end-to-end confidence in the full design — partial rollout of just the high-priority pieces risks locking in a format we later discover doesn't hold up once the rest is built out.

## 1. Motivation: the need for an interchange format

Today, a Fluid document stored by a service like ODSP is an **internal, undocumented, service-owned format** — effectively a black box. It is not specified anywhere outside that service's own implementation, it is not portable, and it is free to change at any time without notice, because nothing outside the service depends on its concrete shape. There is no standalone, portable artifact that represents "this Fluid document" as a real file — something that can be exported, emailed, archived, migrated between services, or opened (at least partially) by a tool that has never heard of Fluid.

As Fluid-based documents become first-class files (not just live collaborative sessions), we need a **real, versioned, portable package format** that:

- Can be produced from a live container's summary at a point in time.
- Can be fully round-tripped back into a live, resumable Fluid container (no data loss of collaborative state).
- Is independent of any particular driver/service — a generic container format, with service-specific behavior layered on top (e.g. ODSP choosing to natively recognize/promote part of it).
- Is understandable, at least in part, by tools that are not Fluid-aware.

This is distinct from (and should not be confused with) the live summary/snapshot wire protocol, which remains an internal, incremental, service-specific transport optimized for collaboration — not for portability.

## 2. The need for a "projection" inside the package

A Fluid document's collaborative state (`.protocol` + `.app`) is only meaningful to a Fluid-aware runtime. Opened by anything else (a generic file browser, a preview pane, search indexing, an older/foreign client), it is opaque.

For a Fluid file to be a good citizen as a *file* — previewable, indexable, searchable, renderable without invoking the full Fluid runtime — the package needs a part that is:

- **Application-authored**, not Fluid-runtime-authored: a rendering of "what this document currently looks like" (e.g. HTML, an image, a PDF-like snapshot), produced by the application/data model, not by the collaboration machinery.
- **Top-level and primary**: the thing a generic tool encounters first when opening the package, analogous to how OOXML/EPUB designate a primary part.
- **Optional and ignorable**: drivers/services that don't care about this capability can drop it or never produce it; it must not be required for a document to function as a live collaborative Fluid container.

We refer to this part as **`.projection`**. It is "top and center" specifically so that opening the file outside the Fluid API shows something meaningful, while the full collaborative state remains fully preserved alongside it for Fluid-aware consumers.

Note: making `.projection` *natively* rendered by a specific service (e.g. SharePoint preview) is a service-side capability, separate from — and larger in scope than — defining the package format itself. The package format must support the scenario without requiring it.

**A concrete motivating use case for `.projection` being independently fetchable**: a read API can accept hints indicating which parts of the package the caller actually needs — e.g. `.projection` plus full `.collab` (snapshot + ops), or `.projection` alone with `.blobs`/images excluded. The latter is useful for consumers like search indexing, which want a lightweight, human/tool-readable rendering of the document without paying the cost of fetching binary attachment content. This is a direct consequence of `.projection` being a self-contained, independently-meaningful part (§3.3) rather than requiring a full package fetch to make sense of.

## 3. Proposal

### 3.1 Container format

Use a **zip container with a manifest**, following the precedent of OOXML (.docx/.pptx), ODF, and EPUB:

- Ubiquitous tooling support, random access to individual parts, streamable.
- A root `manifest.json` declares package format version, the set of top-level parts, and which part (if any) is "primary" for generic viewers.

```
container.fluid  (zip)
├── manifest.json                ← PACKAGE-FORMAT manifest (Fluid-defined, application-independent):
│                                    package version, set of top-level parts, primary-part pointer
├── .projection/                 ← application-specific, human/app-facing; real files, real names
│   ├── manifest.json               (OPTIONAL — only if the application's own projection format)
│   ├── index.html                  (or .png / .pdf / etc., app-defined)
│   └── media/
│       └── cover.png               (self-contained: app-chosen name, possibly a duplicate
│                                      of bytes that also live under /.blobs/)
└── .collab/                     ← everything needed to resume live collaboration; nothing here
    │                                is meaningful without the rest of .collab
    ├── tree.json                  ← (Fluid-defined, application-independent):
    │                                 full tree shape + metadata (groupId, unreferenced, flags, etc.)
    │                                 + blob references by hash.
    ├── .ops/                      ← (OPTIONAL): op tail + 30 days of ops for offline support.
    │                                 Internal representation deliberately left unspecified.
    └── .blobs/
        ├── <hash-a>
        ├── <hash-b>
        └── ...
```

> **Naming note:** the top-level `manifest.json` and `.collab/tree.json` are both **package-format metadata defined by this proposal**, with fixed, Fluid-controlled schemas. Anything under `.projection/`, including a file that happens to also be named `manifest.json`, is **entirely application content**: its shape, meaning, and even whether it exists at all is up to the application, and Fluid/the package format place no interpretation on it. This distinction matters in practice, since applications commonly ship their own `manifest.json` (e.g. web app manifests) as part of their rendered output.

### 3.2 Top-level split: `.projection` vs `.collab` (with `.ops` and `.blobs` nested inside)

- `.collab` = today's `.protocol` + `.app`, fully sufficient to resume live collaboration as of the point in time the package was produced. `.ops` and `.blobs` live *inside* `.collab` rather than as top-level siblings, since both are purely collaboration-resumption plumbing — an op log to replay forward and the content store `tree.json` references by hash — and neither is meaningful without `.collab/tree.json`. A consumer that drops `.collab` entirely (keeping only `.projection`) drops all three together, which matches how tightly coupled they actually are.
- `.ops` = optional op log capturing anything sequenced after that point in time (if the package is produced from a live, still-connected container rather than a clean summary boundary). Its presence lets a consumer resume collaboration with zero data loss even if the package wasn't captured exactly on a summary/checkpoint boundary. Its *internal* representation (e.g. one JSON array, NDJSON, chunked, etc.) is intentionally left unspecified at this stage. **Invariant: `.ops` may be omitted only when `.collab/tree.json` itself reflects the latest sequence number** (i.e. the package was produced exactly at a summary boundary); if the package was produced from a live container with ops sequenced after the last summary, `.ops` must contain the complete, ordered tail from that summary's sequence number forward — a partial or missing `.ops` in that case means losing the most recent collaborative state.
- `.projection` = application-authored rendering, meant for non-Fluid consumption. Real file names, real extensions, no indirection required for a generic tool to use it. Everything inside it — including filenames and structure — is application content, not defined by the package format.
- `.projection` and `.collab` are top-level siblings in the package manifest; `.ops` and `.blobs` are siblings *within* `.collab`, not top-level. A driver/service that doesn't understand `.projection` can ignore it entirely; a consumer that doesn't need live-resumability can ignore `.collab/.ops` specifically while still using `.collab/tree.json` + `.collab/.blobs` (possibly losing only the not-yet-summarized tail of ops if `.ops` is dropped).
- **`.collab` is the source of truth; `.projection` is a derived view.** `.collab` holds the full, authoritative Fluid document state and may carry a richer representation than `.projection` exposes (e.g. collaborative/data-model detail that has no meaningful non-Fluid rendering, or detail the application chooses not to surface). `.projection`, by design, can **never** be richer than `.collab` — it is generated *from* `.collab` state, so it is always a (possibly lossy) projection of it, never a superset. This is also why, per §3.7/§3.8, `.projection`-only edits can safely trigger a full `.collab` rebuild: `.projection` never contains information that isn't (or wasn't) already derivable from `.collab`. (See §3.7 for the important caveat that this rebuild can still be lossy, and the recommended headless-client editing path.)

### 3.2.1 `.collab` is a JSON manifest, not a literal file tree

A zip/folder tree has no native place to hang per-node metadata (e.g. `groupId`, `unreferenced`) — folders and files only have names and bytes. Rather than invent file-tree conventions (marker files, naming schemes) to carry that metadata, `.collab/tree.json` is a single serialized document mirroring today's `ISnapshotTree`/`ISummaryTree` shape directly: trees, blob references (by hash, into `.collab/.blobs/`), and whatever node-level metadata the live protocol already has (`groupId`, unreferenced flags, etc.). This is close to simply persisting the existing wire format, rather than re-encoding it as a directory structure. It also avoids the "blobs need extensionless hash filenames" problem, since `.collab` is not meant to be browsed as files at all — only `.collab/.blobs/` holds raw bytes, and only `.projection` is meant to be opened as a file tree.

Note that blob *type* (summary blob vs. attachment blob) is a property of the blob itself, not of the tree — it is encoded in the hash/id used to address the blob under `.collab/.blobs/` (see §3.3), not as a separate field in `tree.json`.

### 3.3 Blob representation

A single rule for identity, applied uniformly to every blob regardless of whether it is a "summary blob" or an "attachment blob" in Fluid's internal model — blob type is encoded as part of the blob's hash/id itself (not as separate tree metadata), consistent with how ODSP already handles this distinction at the storage layer (see §3.5):

| Concept | Scope | Derived from | Used for |
|---|---|---|---|
| **Hash** | Global | Content bytes + blob type (summary vs. attachment) | Identity, dedup, integrity, `.collab` addressing |
| **Name** (e.g. `cover.png`) | Local to a single reference site | Caller-chosen, assigned when a blob is placed into `.projection` | Human/tool friendliness; also implies mime type via extension |

Consequences:

- Blob *type* (summary vs. attachment) is folded into the hash/id itself (e.g. a two-part hash, or a type tag mixed into the hash input — see §3.5), not stored as a separate field anywhere in `tree.json`. This keeps `tree.json` a pure tree-shape-plus-references document, and keeps blob type a property of the blob's identity, consistent with how ODSP already treats it today.
- `.collab` never needs names — `.collab/tree.json` addresses every blob purely by hash (see §3.2.1); `.collab/.blobs/<hash>` holds raw, extensionless, anonymous bytes.
- Names are **only** introduced where `.projection` is assembled. The builder of `.projection` is the same code that decides "this blob is the cover image" and therefore already knows what to call it — exactly analogous to how a summary tree node name today is chosen by whichever DDS/data-store is building that part of the tree, not by the blob itself. No blob anywhere carries an intrinsic name.
- Because a `.projection` name already has to be chosen deliberately (`cover.png`), its extension doubles as the mime type signal — no separate mime-type metadata needs to be persisted on the blob. This means **no `uploadBlob()` API change is needed**: mime type is only ever relevant at the point something is named, and naming only happens in `.projection`.
- `.projection` is a self-contained, ordinary file tree: it duplicates bytes from `.collab/.blobs` as needed rather than referencing them, because there is no general way to decide which blobs are "shareable" vs "single-use" for dedup purposes — the same bytes can be a one-off asset in one document and a shared asset in another. This mirrors how any other "export to file" format behaves (e.g. saving a web page as HTML + files duplicates a shared logo across pages). **This self-containment is a hard requirement, not just the default**: `.projection`, as it appears in the package, must consist of ordinary, independently-openable files with no indirection into `.collab`. A producer is free to use a reference-by-hash into `.collab/.blobs` as an internal storage/transfer optimization, but it must materialize that reference into a real, self-contained file before it is exposed as part of `.projection` — otherwise a consumer that legitimately drops `.collab` (per §3.2) would be left with unresolvable references, defeating the entire point of `.projection` being independently consumable.

### 3.4 Protocol: where `.projection` comes from, and where it lives in the tree

**`.projection` is just a summary.** It is produced the same way any other part of a Fluid summary is produced: the application (or a data store/DDS within it) contributes a sub-tree during the normal summarize flow, following all the usual summary rules — most importantly, it can be **incremental**, using the same handle/reuse mechanism as the rest of the summary, so that on a given summarize call only the parts of `.projection` that actually changed since the last summary need to be rewritten; unchanged parts are referenced via summary handles exactly like any other unchanged sub-tree. There is nothing special about `.projection` from the runtime's point of view — it's simply a summary tree an application chooses to produce, that happens to be a human/tool-consumable rendering of (part of) the document.

Because `.projection` is "just a summary," it is also subject to the same boot-time/snapshot-size concerns as any other summary content: if an application lets `.projection` grow large (e.g. many large preview images), it must mark that sub-tree with a `loadingGroupId` so that ordinary document load/boot does not need to fetch it eagerly. This is not a new concept — it's the same mechanism used today to keep unrelated large data out of the critical boot path — but it's worth calling out explicitly here because `.projection` is new, easy to add to, and easy to forget to tag.

**`.projection` should carry enough metadata to be diffable against the state it was derived from.** Concretely, when the application data model is SharedTree-based (and history is enabled), `.projection` should record the SharedTree revision ID it was generated from, alongside the summary's sequence number. Sequence number alone is not sufficient for some consumers (e.g. agentic workflows that need to diff two versions of `.projection` against each other) — the revision ID is what actually lets such a consumer determine what changed between two projections without re-deriving it from `.collab`. This is metadata the application chooses to embed in `.projection` itself (it's application content, per §3.3), not a package-format-level field.

**Where `.projection` shows up in the tree is a separate, service-facing question**, and we have a preference plus a fallback:

- **Preferred shape**, from a pure Fluid/runtime perspective:

  ```
  (summary root)
  ├── .protocol
  └── .app
      └── .projection
  ```

  i.e. `.projection` is simply a normal sub-tree of `.app`, alongside the rest of application data, produced and refreshed like any other part of the summary.

- **Fallback shape**, if the preferred shape isn't acceptable (e.g. to a service that wants a structural guarantee that `.projection` is always cleanly separable/extractable without parsing `.app` internals):

  ```
  (summary root)
  ├── .projection
  └── .collab
      ├── .protocol
      └── .app
  ```

  i.e. `.projection` is promoted to a top-level sibling, and everything else (including `.protocol`) is nested under `.collab` (consistent with §3.2/§3.2.1).

Our expectation is that the runtime will very likely implement the **first** shape regardless — it's simpler, requires no new concept beyond "a sub-tree with a `loadingGroupId`," and fits naturally into the existing summarize pipeline — and that if the second shape is what actually needs to be persisted at rest, the **ODSP driver** (not the runtime) takes on the responsibility of rearranging the summary from shape #1 into shape #2 as it uploads. This keeps the "where does `.projection` get produced" question (runtime/application concern) decoupled from "how is the package laid out on disk" (driver/service concern).

### 3.5 Note: summary-blob vs. attachment-blob, and `loadingGroupId` (`loadingGroupId` unification is future direction, out of scope for v1)

Blob type (summary vs. attachment) is preserved in this package format by folding it into the blob's hash/id (§3.3), not by any separate tree-level field — this requires no protocol change, since ODSP already does not dedupe attachment and summary blobs with identical payloads against each other today (blob "type" is effectively already folded into the hash/id ODSP assigns internally). The package format just needs to make that encoding explicit and documented (e.g. a two-part hash, or mixing a type tag into the hash input) rather than relying on service-internal, undocumented behavior.

Separately, Fluid also has `loadingGroupId` (a property of a *sub-tree*, used to decide what gets fetched together — see `packages/runtime/runtime-utils/src/snapshotUtils.ts` and `summaryUtils.ts`), which is a different, coarser-grained mechanism solving a related problem (letting a service avoid eagerly shipping bytes it doesn't need yet). It's tempting to eventually unify the two — e.g. have the runtime mark the sub-tree that holds attachment-style blobs with a `groupId` and let that supersede the separate attachment-blob concept entirely, eliminating `ISummaryAttachment` as a type. However:

- This is a protocol-level change (BlobManager, GC, every driver), independent of and larger than the package format itself.
- It doesn't have to block or shape the package format — `.collab/tree.json` just needs to preserve whatever `groupId` metadata exists at the time a package is produced, whether or not the attachment-blob concept is eventually folded into it.
- The package format is a new feature; a service like ODSP can continue writing/reading its existing at-rest format for live collaboration (including legacy attachment-blob semantics) while independently adopting this package format for export/interop, so there's no forced coupling between the two migrations.

We call this `loadingGroupId` unification out explicitly as a plausible future simplification worth tracking, but it is **not** a prerequisite for, or implied by, the package format proposal above.

### 3.6 Versioning and extensibility

- `manifest.json` carries a package format version; unknown top-level parts must be safely ignorable by readers.
- `.collab/tree.json` mirrors `ISnapshotTree`/`ISummaryTree` closely enough that producing it from an existing summary (and consuming it back into one) should be a mostly mechanical transform — walk the tree, resolve any `ISummaryHandle`s to real content (a package is a full, point-in-time materialization; it does not carry the incremental-summary optimization), hash every blob, write to `.collab/.blobs/` once.
- **Encryption / sensitivity labels are explicitly out of scope for this proposal.** A package (in either `.collab` or `.projection` form) may be subject to encryption-at-rest or IRM/sensitivity-label protection as a layer on top of this format, exactly as any other file can be today — this proposal does not define or change that layer, and treats it as orthogonal.

### 3.7 Integrity: detecting edits made outside Fluid, via a checksum

`.collab` must be an exact, faithful representation of collaborative state — any external edit to it has to be detectable, since a Fluid-aware consumer cannot safely resume collaboration (replay ops, continue summarizing, etc.) against state it can't trust. At the same time, `.projection` is explicitly meant to be editable by non-Fluid-aware tools and workflows (e.g. a generic file-editing tool that only understands the rendered content, not the collaborative model) — and such edits are a *legitimate, supported* way to produce a new, valid Fluid package, not an error condition.

**Important scope note on the threat model**: what follows is a self-recorded checksum, not a cryptographic signature with an external trust anchor. It detects *accidental* or *incidental* modification of `.collab` by a tool that doesn't know to update/preserve it (e.g. a generic editor that only touches `.projection` and leaves `.collab`'s bytes alone, or a naive copy/re-zip that corrupts something). It does **not** protect against a party with intent to tamper: anyone able to rewrite package bytes can simply recompute and rewrite the checksum(s) too, so this mechanism should not be relied on for any adversarial/security guarantee. We call it a "signature" informally in discussion, but "checksum"/"consistency hash" is the more accurate term, and that's what it's meant to provide — self-consistency detection, not authenticity.

This motivates a **checksum** (likely stored in the top-level `manifest.json`, exact placement TBD) built from two separate hashes, computed independently:

- **A hash of everything under `.collab`** (i.e. `.collab/tree.json`, `.collab/.blobs/*`, `.collab/.ops/*` — the whole collaboration-resumption bundle). This is the value checked to detect incidental modification of `.collab` itself. (Epoch is not part of `.collab`'s own state in this proposal — see §3.8 — so there is no exclusion to carve out here; the hash simply covers everything `.collab` contains.)
- **A hash of everything under `.projection`**. This is the value `.collab`'s checksum effectively "pins" — i.e. `.collab`'s own hash is computed over a payload that includes (or is accompanied by) the `.projection` hash it was derived from, so that a change to `.projection` is detectable without needing to inspect `.collab`'s contents at all. In other words, `.collab` doesn't just describe its own state — it also records which exact `.projection` it is consistent with.

With two independent hashes, the two failure modes in §3.7 become simple comparisons:

- **`.collab`-modification detection**: recompute the hash of `.collab`'s contents and compare to the stored `.collab` hash. Mismatch ⇒ `.collab` is damaged — **treat as absent** (this resolves the earlier open question: we do not hard-fail collaborative APIs in this case, we simply fall back to the same "no `.collab`" path described below and in §3.8, since that path is already well-defined and there's no benefit to a separate hard-failure mode).
- **`.projection`-drift detection**: recompute the hash of `.projection`'s contents and compare to the `.projection` hash recorded as part of `.collab`'s checksum. Mismatch ⇒ `.projection` has moved on since `.collab` was produced; `.collab` is stale and must be ignored/rebuilt (§3.8), *regardless* of whether `.collab`'s own hash still checks out (a non-Fluid-aware tool that only edits `.projection` naturally leaves `.collab` byte-for-byte untouched, so `.collab`'s own hash would still pass — the `.projection` hash comparison is what catches this case).

This keeps the two concerns orthogonal: `.collab`'s hash answers "has `.collab` itself been modified outside Fluid," and the separately-recorded `.projection` hash (inside `.collab`) answers "is `.collab` still consistent with the current `.projection`."

**What this checksum does *not* prove.** A passing `.projection`-drift check only establishes that `.projection`'s bytes match what `.collab` was built against at the time `.collab`'s checksum was computed — it says nothing about whether `.collab` itself is fully up to date (e.g. it may have a trailing, not-yet-summarized op tail; see §3.9). Staleness relative to live collaborative state and drift relative to `.projection` are different concerns: this checksum mechanism addresses only the latter.

**An important invariant this enables: a read of a package followed immediately by re-uploading exactly what was read must be a no-op.** Since the write path (§3.8) is keyed on existing summary-handle/proposal-handle preconditions rather than a byte-content comparison, "no semantic change happened" needs its own explicit check: if the uploaded bytes are identical to what's already stored (accounting for whatever encryption/sensitivity-label wrapping was applied — see the scope note on encryption in §3.6), the service should treat the upload as a no-op rather than creating a new generation of `.collab`/epoch churn. This matters in practice for any workflow that reads a file and writes the same content back (e.g. roundtrip tooling, naive backup/restore) — such a workflow should never observe epoch changes or unnecessary version history entries purely as an artifact of the round-trip.

This is also the mechanism that lets an external, non-Fluid-aware tool legitimately "take over" a file: it only needs to modify `.projection` — it does not need to understand or update `.collab`/`.blobs` at all, and may leave `.collab` untouched or delete it. Either way, the `.projection` hash comparison catches the drift and the stale `.collab` is never used once `.projection` has moved on.

Note that re-deriving `.collab` from `.projection` is explicitly **out of scope for this document and for the protocol**: it is purely application domain. The package format and protocol only need the application to be able to turn its current `.projection` state back into a summary — *how* it does so is entirely up to it. In particular, this conversion need not be deterministic (e.g. the application is free to mint new UUIDs for data-store/DDS identities as part of rebuilding `.collab`); nothing in the format or protocol depends on reproducibility of that process.

Because `.projection` can be a lossy rendering (see §3.2), rebuilding `.collab` from an externally-edited `.projection` is a **best-effort, potentially lossy** reconstruction — it can lose collaborative-state detail that existed only in the old `.collab` and was never surfaced in `.projection` (e.g. in-flight session state, or data-model detail with no projected rendering). This is an accepted consequence of allowing non-Fluid-aware tools to edit `.projection` directly, not a defect in the rebuild mechanism specifically — it's structurally the same risk that already exists today whenever a file is externally replaced while a live collaboration session is still open against the old version. Applications that need changes to merge cleanly with live collaborative state, rather than risk this lossy fallback, should make those changes **through a headless Fluid client** (i.e. by driving the edit through an actual Fluid session, so it's properly merged into `.collab` as ops/summary) rather than by editing `.projection` directly. Editing `.projection` directly is best understood as a lossy, best-effort path for tools that have no other way to participate — not the primary way applications are expected to modify documents.

A direct consequence: **a package with no `.collab` section at all is a valid file.** It just means there is no live collaborative state yet (or it was deliberately dropped/superseded) — `.projection` alone is sufficient for the package to be well-formed and openable by a Fluid-aware client, which would need to (re)create `.collab` from `.projection` before collaboration can begin.

**`.projection` is also optional (§2), so "treat `.collab` as absent" is not always recoverable.** If `.collab`'s hash check fails (or `.collab` is simply missing) and the package *also* has no `.projection`, there is nothing to rebuild `.collab` from — §3.8's recovery path only works when a valid `.projection` exists. A package with damaged/missing `.collab` and no `.projection` is a genuinely unrecoverable, broken file; a Fluid-aware client must surface this as a hard error rather than attempt recovery. (A package produced with neither a valid `.collab` nor any `.projection` at all is, in practice, a degenerate/invalid export — there was nothing to resume and nothing to render — and producers should avoid ever emitting one.)

### 3.8 Mechanism: recovering `.collab` after a `.projection`-only (or `.collab`-dropping) edit

When `.collab` is missing or doesn't match `.projection` (per §3.7), the following sequence re-establishes a usable collaborative state:

1. **The recovery-establish API does *not* bump epoch.** This was revised from an earlier draft of this section that proposed epoch as both the "something external replaced `.collab`/`.projection`" signal and the race-precondition for the new recovery-establish API. On reflection, that overloaded epoch incorrectly:
   - Epoch changing on *every* summary (including the very first app→collab conversion) would be inconsistent with how summaries behave everywhere else — a summary never bumps epoch today, and if it did, it would break live collaboration (any already-connected client would be forced into a hard `fileOverwrittenInStorage` failure merely because a normal summary was posted). The recovery-establish API, conceptually, is posting a summary — it should **not** bump epoch, for the same reason ordinary summarization doesn't.
   - Epoch still changes exactly where it already does today: on whole-file binary replacement/re-upload or version-restore (`epochTracker.ts`). That's the case that actually matters here too — when a non-Fluid-aware tool replaces `.projection` by re-uploading the whole package as an ordinary file, that's a whole-file replacement, so it already bumps epoch today, with no proposal change needed. That's what forces a live/rejoining client with the old epoch to fail hard and go through recovery.
   - **Races on the recovery-establish API itself are resolved using the same mechanism ODSP already uses for summary uploads — a summary-handle precondition, not epoch.** `OdspSummaryUploadManager.writeSummaryTree` (`packages/drivers/odsp-driver/src/odspSummaryUploadManager.ts:57-85`) already submits a `parentHandle`/proposal handle with every summary write, and the service accepts the write only if that still matches the file's current summary handle — this is precisely "only one client can successfully post a summary from a given starting point," which is exactly the race we need to guard here (only one client should win the app→collab conversion for a given starting state). The recovery-establish API reuses this existing precondition unchanged, rather than inventing a new epoch-based one.
   - This also means there is no epoch/hash circularity to resolve in the first place (an issue the previous draft of this section introduced and then had to specially work around): since the recovery-establish API doesn't touch epoch at all, the `.collab` checksum (§3.7) can simply cover all of `.collab`'s content, with no need to carve out an epoch exception.
2. **All Fluid APIs except `getLatest`/snapshot-read fail** with a specific, distinguishable error code (reusing or extending `fileOverwrittenInStorage`-style semantics) until a new `.collab` is established. (This failure is driven by the epoch change that already happened when `.projection` was replaced via whole-file upload — see point 1 above — not by anything the recovery-establish API itself does.)
3. **`getLatest` is extended with an explicit discriminator** so callers know which form they got back: it returns either (a) the current `.collab` (snapshot + ops), tagged as such, when `.collab` is valid, or (b) `.projection` content, tagged as such, when `.collab` is missing/stale. This is a new, distinct response shape/flag — not an attempt to make `.projection` content masquerade as a normal snapshot — so a client can always retrieve *something* meaningful even mid-recovery, and can tell unambiguously which case it's in (and therefore whether it needs to go through the recovery path below before using normal collaborative APIs).
4. **A new service API lets a client upload a fresh summary and establish new `.collab` state**, essentially the moral equivalent of "create new" but against an existing file/epoch rather than a brand-new one. Per point 1, this does not bump epoch and does not reset the file's last-writer id/timestamp — from the service's point of view it is simply "the first summary posted against this file."
5. **Races on this new upload API are resolved via the existing summary-handle precondition mechanism, not a novel one.** As described in point 1, this reuses `OdspSummaryUploadManager`'s existing `parentHandle`/proposal-handle precondition (`packages/drivers/odsp-driver/src/odspSummaryUploadManager.ts:57-85`): the client submits the summary handle it expects the file to currently be at (obtained from the same `getLatest` call it used to decide `.collab` needs rebuilding — step 3), and the service accepts the write only if that still matches; otherwise it rejects, mirroring today's summary-nack handling. The losing client's retry path is then just the normal recovery flow again: re-fetch via `getLatest`, discover the (now different) current `.collab`/`.projection` state, and decide again whether to rebuild `.collab` from the latest `.projection` or simply adopt the winner's `.collab` as-is. This requires no new concurrency primitive.
6. **Once a summary is successfully posted, all Fluid APIs resume working normally.**

**Acknowledging duplication, and why it's acceptable.** Establishing `.collab` this way means re-uploading bytes that are already present in `.projection` (e.g. `cover.png`) — today there is no single REST call that both uploads a summary tree *and* creates new attachment blobs (summary upload and `createNewBlob`-style attachment-blob upload are separate calls; see `odspSummaryUploadManager.ts`), so there's no way to avoid this duplication purely at the protocol level without new service capability. We treat this as acceptable for now rather than something to solve in this proposal: `loadingGroupId` is enough to make it *work* today (pack the re-uploaded blobs under a group-tagged subtree so they don't impact boot time), and a more efficient reference-by-hash upload path can be revisited later if duplication proves costly in practice.

It's also worth being explicit about what this duplication actually means: **this package format is an interchange/export format** — what SPO produces when a file is downloaded/exported, and what it consumes when a file is uploaded/imported — **not a description of how SPO stores data internally.** SPO's actual at-rest storage is unaffected by this proposal and will continue to dedupe/store blobs however it already does; there is no new duplication introduced into storage itself. The duplication discussed above exists only within the interchange artifact (the thing that leaves/enters SPO as a file), not within SPO's internal representation.

### 3.9 Out of scope: keeping `.projection` fresh for files at rest

This proposal defines the package format itself; it deliberately does **not** describe the mechanism that keeps `.projection` from going stale relative to `.collab` while a document is at rest between collaboration sessions.

Concretely: once a collaboration session ends, `.collab` can have a trailing tail of ops sequenced after the last summary — ops that were applied to live collaborative state but never folded into a new summary (and therefore never reflected in `.projection`, which is only ever regenerated as part of producing a new summary). Until something explicitly closes that gap, `.projection` reflects the state as of the last summary, not the true latest state, even though `.collab` (summary + trailing `.ops`) is fully caught up.

Eliminating this tail — i.e. deciding when a session has ended, opening the Fluid container, posting a fresh summary (which both catches up `.collab` to a clean summary boundary and regenerates an up-to-date `.projection`), all **without** holding a live, connected (web-socket) session for efficiency — is application/service responsibility, implemented as a separate process from this proposal. This proposal only needs `.projection` to be *some* valid, internally-consistent snapshot of state as of whenever it was last produced (per §3.7's checksum mechanism, which detects drift but — per §3.7 — does not by itself prove freshness relative to any trailing op tail); it does not mandate how promptly, or by what trigger, that regeneration happens.

## 4. Open questions / follow-ups

1. Whether/when to pursue the `loadingGroupId` / attachment-blob unification described in §3.5 — tracked as a future direction, explicitly not required for this proposal.
2. The internal representation of `.ops` (encoding/format of individual ops, batching/chunking strategy, whether it's one file or many, and the exact sequence-number boundary rule for what must be included) — deliberately left open; only its existence, role (optional, ignorable, nested under `.collab`), and omission invariant (§3.2) are proposed so far. Two independent implementations cannot yet interoperate on `.ops` without this being specified.
3. Checksum wire format (§3.7): exact placement (top-level `manifest.json` vs. elsewhere), exact hash algorithm/encoding, and canonicalization rules (entry ordering, path normalization, whether hashing covers uncompressed logical content vs. raw zip bytes — this matters because a harmless re-zip should not look like tampering). The failure mode when `.collab`'s own hash doesn't match is already resolved (treat as absent; §3.7); what remains open is purely the concrete bit-level format.

## Appendix A: Worked example — summary tree to package layout

This appendix walks through one concrete, simplified example of a Fluid summary and shows exactly how it maps to the on-disk package layout described in §3.1–§3.3. It is illustrative only — field names/shapes are simplified from the real `ISummaryTree`/`ISnapshotTree` shapes for readability.

### A.1 The summary tree (today's in-memory/wire shape)

Imagine a document with one data store (id `3f9a1c2e-...`, a UUID — data store IDs are UUIDs in practice, abbreviated here for readability) containing two DDSes — a SharedTree (the actual document content) and a cover-image attachment — plus an application-authored `.projection` sub-tree the app contributes alongside its own data:

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
        │                                     marked with loadingGroupId "projection" to keep it out of the boot path)
        ├── index.html                      (ISummaryBlob: "<html>...cover.png...</html>")
        └── cover.png                       (ISummaryBlob: raw PNG bytes — duplicated from the attachment above, per §3.3)
```

Notes on this shape:
- `.protocol` and `.app` are exactly today's existing summary split (§3.2) — nothing new here.
- `cover`'s `ISummaryAttachment` is a reference to a blob uploaded out-of-band via the attachment-blob upload path (not inline `ISummaryBlob` content) — this is today's existing summary-blob-vs-attachment-blob distinction (§3.5).
- `.projection/cover.png` is a plain `ISummaryBlob` with the **same bytes** as the attachment blob referenced by `cover/blob` — this is the duplication §3.3/§3.8 call out as acceptable within the interchange package.
- `.projection` here uses the **preferred shape** from §3.4 (a direct sub-tree of `.app`, alongside the `3f9a1c2e-...` data store).

### A.2 Resulting package layout (`container.fluid`, a zip)

Producing a package (§3.1, §3.6) walks this tree, resolves everything to real content (no summary handles — a package is a full materialization), hashes every blob, and writes:

```
container.fluid  (zip)
├── manifest.json
│     { "packageFormatVersion": 1, "primaryPart": ".projection" }
│
├── .projection/                                  ← lifted out of .app/.projection (§3.4: driver
│   ├── index.html                                   rearranges preferred→fallback/persisted shape)
│   └── cover.png                                  ← real, duplicated bytes — an ordinary file, openable
│                                                      by anything, no indirection into .collab
│
└── .collab/
    ├── tree.json
    │     {
    │       "checksum": { "collabHash": "h_9f...", "projectionHash": "h_7e..." },   ← §3.7
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
    │               "blob": { "blob": "h_a1b2c3...", "type": "attachment" }        ← §3.3/§3.5: blob type
    │             }                                                                   folded into hash/id
    │           }
    │         }
    │       }
    │     }
    │
    ├── .ops/                                       ← (optional; omitted here — this package was captured
    │                                                   exactly at a summary boundary, per §3.2's invariant)
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
| `.protocol/attributes` | `.collab/.blobs/h_aa11...`, referenced from `.collab/tree.json` | Ordinary summary blob — content-addressed, no name needed (§3.2.1) |
| `.app/3f9a1c2e-.../.component` | `.collab/.blobs/h_bb22...` | Same — pure collaboration-resumption content |
| `.app/3f9a1c2e-.../content/header` | `.collab/.blobs/h_cc33...` | Same — this is the actual SharedTree document content; `.projection` is a *rendering* of it, not a substitute for it |
| `.app/3f9a1c2e-.../cover/blob` (attachment) | `.collab/.blobs/h_a1b2c3...`, tagged `type: attachment` in `tree.json` | Attachment blobs live in the same `.blobs` content store as summary blobs, distinguished only by the type tag folded into their id (§3.3/§3.5) |
| `.app/.projection/index.html` | `.projection/index.html` | App-authored rendering, promoted to top-level `.projection` by the driver (§3.4) — real name, no indirection |
| `.app/.projection/cover.png` | `.projection/cover.png` | Same bytes as `h_a1b2c3...`, but duplicated as a real, named file so `.projection` is self-contained (§3.3) |

The key takeaway: every piece of `.collab` content is addressed purely by hash and needs the rest of `.collab` to be meaningful; every piece of `.projection` is an ordinary, independently-openable file — even where (as with `cover.png`) it happens to carry the same bytes as something already present in `.collab/.blobs`.
