# Application File Architecture and Roadmap

**This document describes the wider direction, including work outside this repository and unimplemented proposals.**
The implemented Fluid mechanisms and remaining SDK work are in [DESIGN.md](DESIGN.md);
[README.md](README.md) is the runnable walkthrough.

## Goal and implemented foundation

Enable applications outside Fluid to create and read collaborative files through a documented application format.
Creators supply application content, feature metadata, and assets; readers consume application state at a summary
checkpoint without decoding DDS state or replaying operations.

**Collaborative HTML canvases and rich-text documents motivate this work.** An external producer, including a Rust-based
generator, should write HTML or Markdown without a native DDS encoder or document-conversion service. A collaborating
application later loads that content, supports ordinary edits, and keeps a readable projection alongside native state.
The mechanisms are generic, but these creation, editing, reading, and asset requirements are the evaluation criteria.

The implemented reference creates a two-part HTML seed without instantiating a Fluid Container, loads it into
SharedTree, collaborates, and produces an accepted full native summary. The same runtime then generates incremental
native summaries and skips serialization/upload of unchanged HTML parts. Pending-state restoration is also exercised.
These mechanisms do not depend on a new storage download format, attachment-creation API, Markdown integration, or
background worker.

```text
External HTML/Markdown producer
  -> supported file-creation envelope and storage API
  -> application runtime materializes a native Fluid model
  -> ordinary collaboration and accepted summaries
  -> native Fluid state + readable application projection
  -> external readers, optionally using a documented portable download format
```

The application runtime owns parsing, schema, and native graph construction. Storage contracts independently determine
creation, portable downloads, attachment ownership, and whether loading can omit large payload bodies.

## Representations and authority

| Representation | Contents | Authority |
| --- | --- | --- |
| Seed summary | Loader-valid envelope, versioned application manifest, HTML/Markdown parts and feature metadata | Defines the initial state; accepted operations extend it before a native summary exists. |
| Native summary | Runtime/DDS state plus application projection at the same checkpoint | Native state and subsequent operations are authoritative; the projection is a read representation, not an alternative write target. |

The general application manifest identifies its format, ordered parts, supported non-HTML features, and eventually asset
references. A materialization profile pins parser/normalization, schema, defaults, identifiers, and asset binding.
Production applications must define their own versioned feature coverage; readable HTML or Markdown need not be a
lossless application backup. Never reconstruct an existing collaborative document from its projection while retaining
the old operation stream.

**Seeds and projections are uncompressed trees of application blobs**, not nested archives. ZIP is only an option for
the outer portable download containing the full file state: snapshot, blobs, operation tail, metadata, and attachments.

For the initial application scenario, assume images remain base64 payloads embedded in HTML/Markdown. The executable
reference itself contains no images. A planned single-call creation API would let creators designate separate blobs
that are treated as attachment blobs after creation; that work is not implemented here. Until then, do not claim inline
image bytes avoid encoding or re-upload when their containing HTML part changes.

## Dependency: a documented interchange file format

**Portable file creation/readback requires a documented storage-service interchange contract.** For ODSP, this would
cover files downloaded from SharePoint. It is a proposed dependency, not an existing capability or service commitment.
The format should expose the snapshot tree, blobs as files, checkpoint metadata, an operation tail, and attachments.

It must support **shared references**: multiple leaves can reference one image payload. ZIP is a possible outer package,
not a requirement; use documented manifest/reference records, not archive or filesystem symlinks.

A stable entry point locates the application manifest. References from the selected snapshot must resolve within the
download without requiring earlier server summaries or knowledge of DDS encodings. Native DDS blobs remain opaque to
application-format readers. This is separate from the reference's storage-backed reader, which resolves actual summary
blob IDs through a driver.

## Projection discovery (open design)

The runtime currently lets applications choose a nonreserved root key; the reference uses `applicationProjection`.
A uniform key would simplify discovery. A versioned manifest should identify the format, rather than relying on a
unique directory name to encode it. Agreeing on a shared convention is separate from hard-coding that path in Fluid.

An application-supplied `AGENTS.md` could explain the projection's format, authority, checkpoint semantics, and
supported operations to readers of an interchange download. It should be ordinary reusable application content, not a
special executable runtime hook or a replacement for the machine-readable manifest. These points remain open for
discussion: the reference does not add that file or mandate a shared root key.

## Images and single-call creation (not implemented)

The asset goal is **one payload pool shared by seed, native state, and read projection**. After this work is
implemented, materialization/projection should reference image bytes without reading them, and native graduation should
not upload the same image again. These are future requirements, not properties of today's inline-image assumption.

The existing ODSP attachment-creation workflow is **empty file -> attachment uploads -> first summary**.
The planned atomic mixed-summary/attachment API would create the file in one call and designate which blobs become
attachments. Keep the existing multi-call workflow as a fallback while pursuing that contract.

### Proposed grouped-blob graduation

An alternative worth validating is to adopt separately addressable seed blobs as attachments without uploading them
again. **This sequence is not implemented by the reference:**

1. An external creator sends one initial summary: ungrouped envelope/HTML/metadata plus each distinct image once in a
   deferred loading-group subtree. The current create serializer supports tree `groupId` and binary blobs, not
   attachment entries.
2. The manifest maps logical assets to seed paths, MIME types, and digests. Paths are relative to the runtime view
   after the ODSP driver removes `.app`. Storage must return real leaf IDs without downloading image bodies; resolve
   `logical asset -> seed path -> storage ID` at the original checkpoint.
3. Initialize BlobManager with deterministic **nonidentity logical-ID -> storage-ID redirects**. DDS handles refer to
   logical IDs. Identity-only mappings omit normal per-asset GC nodes. Binding existing handles must not fetch or upload
   bytes.
4. The accepted native summary retains attachment references to those IDs and removes the seed payload subtree.
   Subsequent loading, retention, and GC must behave like ordinary attachments.

**Creation-path limitation:** this does not cheaply generalize to creation through a Fluid runtime. The ODSP driver can
cache a synthetic snapshot with fake blob IDs, but attachment references require authoritative storage IDs. That path
needs readback/remapping; closing the creator does not necessarily remove its cache. Never adopt overlay/cache IDs or
silently substitute another checkpoint.

### Service gates and payload rules

Real SPO validation must establish metadata-only grouped loading, attachment GET/reference acceptance, size limits, and
a second cold load after removing the seed group. Verify retention/GC and measure downloaded snapshot bytes, not just
individual blob reads. Driver/client tests do not establish these service guarantees.

The grouped-blob path may work without new SPO implementation only if these gates pass. The explicit mixed-payload
creation API remains independently useful.

- **Deduplicate bytes, not identity:** compatible identical images may share bytes; logical names and placements remain
  distinct. Digest metadata avoids reading image bodies during materialization.
- **Reference-only representations:** after asset support, HTML/metadata/projections use references rather than data
  URLs or embedded archives. Export references without resolving them to image bytes.
- **Export once:** include each referenced payload once in an interchange download; a standalone application archive
  can be produced separately.
- **Preserve reachability:** string locators are not Fluid GC edges. Account for native, projection, and
  retained-history references; remove obsolete projection references when regenerated.
- **Normal edits:** upload a genuinely new image once, then reference it from both representations. Existing inline
  images need explicit write-time migration rather than another upload presented as graduation.

Attachments enable lazy loading and ODSP caching; browser HTTP caching depends on response headers. No cross-file
deduplication guarantee is assumed. Bytes embedded inside DDS blobs or data URLs are not separately addressable image
blobs: they require explicit migration and readers that understand attachment references. Storage improvements alone
do not eliminate application-level image conversion or transport costs.

## Markdown/rich-text follow-on (not implemented)

The goal is direct creation by a non-Fluid producer without calling a conversion service or knowing DDS formats.
A Rust or other producer writes Markdown and versioned application metadata into a supported seed/file envelope.
The application's runtime factory materializes the native graph locally; collaboration then publishes both that graph
and a same-checkpoint Markdown projection. Headless services can subsequently edit the file but are not required for
creation or materialization.

### Native construction

A rich-text application can have aliased metadata/document roots and handle-reachable body/title editors.
SharedDirectory/SharedMap may hold root and feature state, while SharedString holds text, markers, and intervals.
Lists, nested sequences, and embedded components can add channels/datastores. A seed profile defines the selected graph;
registering a factory does not require instantiating it.

**Aliases need complete graph construction, not a new alias protocol.** Existing loaders accept already-aliased native
state. A builder must produce aliases together with store identities, registry paths, root flags, handles, and GC
reachability. Writing `.aliases` alone is insufficient; calling `trySetAlias()` on opening violates the no-write rule.

SharedString and simpler DDSs provide native factories/serializers. Populate a genuinely detached construction
environment, serialize it, then discard it; an attached-but-disconnected runtime with suppressed output can retain
pending operations. Preserve marker/interval identities and SharedDirectory incarnation metadata. Markdown can define
a fresh baseline, not replace native collaboration-window history.

Application initialization needs a deterministic contract. Interactive creation can allocate random IDs, inherit host
locale/attribution, or create children asynchronously. Lazy repair must not run on seed loading. Pin parser/sanitizer,
model profile, locale, attribution, and allocation rules; construct the complete graph before normal loading.
Do not monkeypatch randomness or assume an ordinary paste API has those construction semantics.

### Read-only Markdown projection

Body-only Markdown is not a complete document projection. Preserve title and supported non-Markdown state in a
versioned sidecar; Markdown round trips may normalize content or omit native identities/features.

**Pausing Fluid operations does not automatically synchronize a derived application model.** Resolving references or
updating caches asynchronously requires an additional synchronization barrier. An exporter that loads components,
migrates data, or fetches external content is not automatically read-only checkpoint capture. Use application
synchronization plus immutable capture, or a read-only model of the frozen checkpoint. Explicitly report unsupported
features and failures instead of publishing placeholders.

Start a separate rich-text proof with paragraphs, headings, basic formatting, links, and explicit title/profile
metadata. Add lists after deterministic allocation and application-model synchronization are covered; defer rich
components, comments, and assets. Verify independent construction, no-write opens, native convergence/reload, and
checkpoint consistency under delayed application callbacks. None of this expands the current SharedTree implementation.

## Optional: summarize when collaboration ends

A worker could consume documented session-end/idle notifications, load the application headlessly, catch up, and publish
an accepted native summary plus projection. Notifications and worker hosting remain service-specific dependencies.
This worker is not implemented here.

Only summarize unpublished edits; opening/closing an unchanged file must not convert its seed. Coalesce notifications,
retry failures, avoid self-triggered loops, and use the normal summary protocol. **Freshness at rest is eventual**, not
guaranteed at session close; retain the explicit checkpoint.

## Longer-term: application content as the stored file

A future canonical file could contain only application content, metadata, and shared assets, without embedded Fluid
state. An application-specific service would own recoverable collaboration sessions separately.

That needs safe bidirectional transitions, session authority, in-flight operation handling, recovery, and stale-writer
fencing. The canonical format must cover every required feature, beyond a limited HTML/Markdown projection.
**Seeds and projections are independently useful:** the implemented reference and proposed idle worker retain native
Fluid persistence; easier creation/readback does not depend on replacing it.

## Source starting points for the wider design

Paths are relative to this repository. These identify implementation boundaries, not commitments by external services.

| Files / symbols | Relevance |
| --- | --- |
| `packages\runtime\container-runtime\src\blobManager\blobManagerSnapSum.ts`; `packages\drivers\odsp-driver\src\odspSummaryUploadManager.ts` | Attachment reachability and attachment-ID versus parent-summary-path references. |
| `packages\runtime\container-runtime\src\blobManager\blobManager.ts`, `getGCData` | Nonidentity redirects and per-asset GC nodes. |
| `packages\drivers\odsp-driver\src\createFile\createNewUtils.ts`; `contracts.ts` in the driver directory | Initial creation, loading groups, synthetic cache IDs, and response shape. |
| `packages\common\driver-definitions\src\storage.ts`; `packages\drivers\odsp-driver\src\odspDocumentStorageManager.ts` | Group fetch, cache bypass, and blob GET; service guarantees are separate. |
| `packages\dds\sequence\src\sequenceFactory.ts`; `packages\dds\merge-tree\src\snapshotLoader.ts`; `packages\dds\map\src\directory.ts` | Native detached construction, sequence-history restoration, and directory incarnation metadata. |
