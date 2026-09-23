# Application Projections

**This document describes the wider direction, including work outside this repository and unimplemented proposals.**
This contributor-facing design spans application integration, ContainerRuntime, garbage collection, and storage.
It is not owned by the test harness and does not promise production support for the reference's file format.

## Documentation map

- [Implemented Fluid design](./Application-Projections/Fluid-Design.md): runtime integration, acceptance/reuse mechanics, and remaining SDK work.
- [Application usage](./Application-Projections/Usage.md): external creation/readback and application integration responsibilities.
- [Executable reference](../../../packages/test/local-server-tests/src/test/seedProjection/README.md): run commands and scenario coverage.
- [Reference structure](../../../packages/test/local-server-tests/src/test/seedProjection/DESIGN.md): sample application, test harness, instrumentation, and test boundaries.

## Goal and implemented foundation

Application projections connect application-owned representations and Fluid's collaborative model in both directions: load application content into the model, and publish readable application content from it.
A **seed** is the initial-file case, not the name of the whole capability.

**Runtime/DDS state** means Fluid's runtime metadata and distributed data structure (DDS) representation, including the state that supports collaboration.
It is not the original application seed.
The word **native** in related code refers to this Fluid representation; it is not a separate summary type or another name for the original stored snapshot.

Enable applications outside Fluid to create and read collaborative files through a documented application format.
Creators supply application content, feature metadata, and assets; readers consume application state at a summary
checkpoint without decoding DDS state or replaying operations.

**Collaborative HTML canvases and rich-text documents motivate this work.** An external producer, including a Rust-based
generator, should write HTML or Markdown without a DDS encoder or document-conversion service.
A collaborating application later loads that content, supports ordinary edits, and keeps a readable projection alongside runtime/DDS state.
The mechanisms are generic, but these creation, editing, reading, and asset requirements are the evaluation criteria.

The implemented reference creates a two-part HTML seed without instantiating a Fluid Container, loads it into
SharedTree, collaborates, and produces an accepted full summary containing runtime/DDS state.
The same runtime then generates incremental summaries and skips serialization/upload of unchanged HTML parts.
Pending-state restoration is also exercised.
These mechanisms do not depend on a new storage download format, attachment-creation API, Markdown integration, or
background worker.

```text
External HTML/Markdown producer
  -> supported file-creation envelope and storage API
  -> application runtime materializes the Fluid model
  -> ordinary collaboration and accepted summaries
  -> runtime/DDS state + readable application projection
  -> external readers, optionally using a documented portable download format
```

The application runtime owns parsing, schema, and construction of the runtime/DDS graph.
Storage contracts independently determine creation, portable downloads, attachment ownership, and whether loading can omit large payload bodies.

## Priorities and independent directions

The order of the sections below is not an implementation schedule.
Use these priorities to evaluate the next work; none implies an external service commitment.

| Priority or direction                                                         | Expected outcome                                                                                                         | Relationship to this reference                                                                                                          |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Image support is required.**                                             | Creation, collaboration, and readable projection must preserve images, with explicit payload ownership and reachability. | The reference has no images yet; inline-image assumptions and the proposed shared-payload/attachment design are described below.        |
| **2. Publish the final application representation at rest.**                  | After collaboration ends, unpublished edits eventually appear in an accepted application projection.                     | Session-end/idle summarization is the next priority, not merely a convenience; its hosting and trigger mechanisms remain unimplemented. |
| **3. A documented interchange format is highly desirable.**                   | External tools get a stable, portable way to find snapshot content and assets.                                           | An interoperability improvement, not a prerequisite for the implemented seed/projection workflow or service-specific readers.           |
| **Orthogonal: Markdown and other applications.**                              | The design must extend to other DDSs and application graphs, not just this SharedTree sample.                            | Another application and a generalization test, not a milestone that must wait behind the three priorities above.                        |
| **Longer-term, largely independent: application content as the stored file.** | Separate canonical application content from recoverable collaboration sessions.                                          | Can reuse the creation, materialization, projection, and asset workflows developed here, but is not required to deliver them.           |

## Representations and authority

| Representation            | Contents                                                                                                 | Authority                                                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Seed summary              | Loader-valid envelope and application-defined initial content, with any metadata the application chooses | Defines the initial state; accepted operations extend it before a later summary stores the runtime/DDS state.                            |
| Materialized loading view | Runtime/DDS snapshot generated locally from the original seed                                            | Represents the same source checkpoint without replacing the stored seed or writing initialization operations.                            |
| Later accepted summary    | Runtime/DDS state plus application projection at the same checkpoint                                     | Runtime/DDS state and subsequent operations are authoritative; the projection is a read representation, not an alternative write target. |

Applications define their own content layout, feature coverage, and optional manifest.
The runtime does not require a manifest name, schema, format identifier, or version.
Readable HTML or Markdown need not be a lossless application backup.
Never reconstruct an existing collaborative document from its projection while retaining the old operation stream.

### Three independent application contracts

| Contract                               | Owner                                       | Independence requirement                                                                                                                                                                       |
| -------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| External content and optional manifest | Application and its file producers/readers. | A custom `manifest.json`, another metadata layout, or no manifest is valid from the generic runtime's perspective. The application reader, not Fluid, interprets any external format identity. |
| Deterministic materialization profile  | Application runtime integration.            | Identify the reconstruction rules and enforce agreement between clients. Do not derive this identity from an external manifest or expose it as required application content.                   |
| DDS schema identities                  | Application's model definition.             | Choose schema namespaces and evolution independently. The same schema can support different materialization rules, and a materialization policy can cover more than one schema.                |

Runtime support can compare compatibility evidence without defining what an application's profile means.
The profile belongs to internal runtime compatibility state, not the readable projection's content contract.
Snapshot and protocol metadata are not secret storage; keeping them outside the application representation is a separation of responsibilities, not a confidentiality guarantee.

**Seeds and projections are uncompressed trees of application blobs**, not nested archives. ZIP is only an option for
the outer portable download containing the full file state: snapshot, blobs, operation tail, metadata, and attachments.

For the initial application scenario, assume images remain base64 payloads embedded in HTML/Markdown. The executable
reference itself contains no images. A planned single-call creation API would let creators designate separate blobs
that are treated as attachment blobs after creation; that work is not implemented here. Until then, do not claim inline
image bytes avoid encoding or re-upload when their containing HTML part changes.

## Desirable interoperability: a documented interchange file format

**A documented portable interchange contract is an improvement, not a gate on the core workflow.**
Service-specific tools can use a service's creation/snapshot APIs and interpret its envelope before reading the application projection.
They still need that service's wire contract; the TypeScript snapshot interfaces are not themselves a REST response format.
For ODSP, a portable contract would make files downloaded from SharePoint easier to consume across languages and tools.
It is proposed work, not an existing capability or service commitment.
The format should expose the snapshot tree, blobs as files, checkpoint metadata, an operation tail, and attachments.

It must support **shared references**: multiple leaves can reference one image payload. ZIP is a possible outer package,
not a requirement; use documented manifest/reference records, not archive or filesystem symlinks.

A stable entry point locates the application projection; the application defines how readers find its content and optional metadata.
References from the selected snapshot must resolve within the
download without requiring earlier server summaries or knowledge of DDS encodings. Native DDS blobs remain opaque to
application-format readers. This is separate from the reference's storage-backed reader, which resolves actual summary
blob IDs through a driver.

## Projection discovery

**The application chooses the projection root key.**
`applicationProjection` is the recommended convention used by this reference, not a fixed runtime key.
An external reader follows the application's discovery contract; the runtime does not infer an application format from the directory name.

An application may include a `manifest.json`, `AGENTS.md`, or other documentation alongside its content.
Their names, schemas, and presence are application choices; Fluid requires and interprets none of them.
An optional `AGENTS.md` is ordinary reusable content that can explain format, authority, checkpoint semantics, and supported operations.
It is not an executable runtime hook, and it does not replace whatever machine-readable contract the application chooses.
The reference does not need to add such a file merely to exercise the convention.

## Required: image support and payload ownership (not implemented)

Image support is required for the target application workflow, even though the bounded reference does not implement it.
The initial inline-base64 assumption and the optimized shared-payload design are different delivery stages, not claims of existing support.
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

Markdown is an orthogonal application of the same design, not a dependency of the HTML workflow.
Its mixed-DDS graph is an important test of the requirement that the design extend beyond SharedTree.
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

## Next priority: publish the application representation at rest

After collaboration ends, the file should eventually contain an accepted application projection covering the completed editing session.
Otherwise external readers can indefinitely see stale application content even though the native operation history contains the edits.
This is the next priority after image support; it is not implemented by the reference.

A worker could consume documented session-end/idle notifications, load the application headlessly, catch up, and publish
an accepted native summary plus projection. Notifications and worker hosting remain service-specific dependencies.

Only summarize unpublished edits; opening/closing an unchanged file must not convert its seed. Coalesce notifications,
retry failures, avoid self-triggered loops, and use the normal summary protocol. **Freshness at rest is eventual**, not
guaranteed synchronously at disconnect; retain the explicit checkpoint.
New edits start a new freshness obligation rather than making an earlier accepted projection represent those later edits.

## Longer-term: application content as the stored file

A future canonical file could contain only application content, metadata, and shared assets, without embedded Fluid
state. An application-specific service would own recoverable collaboration sessions separately.
This is largely independent of the current persistence design, but can reuse its application formats, deterministic materialization, projection, shared-asset handling, and checkpoint-aware workflows.

That needs safe bidirectional transitions, session authority, in-flight operation handling, recovery, and stale-writer
fencing. The canonical format must cover every required feature, beyond a limited HTML/Markdown projection.
**Seeds and projections are independently useful:** the implemented reference and proposed idle worker retain native
Fluid persistence; easier creation/readback does not depend on replacing it.

## Source starting points for the wider design

Paths are relative to this repository. These identify implementation boundaries, not commitments by external services.

| Files / symbols                                                                                                                            | Relevance                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `packages\runtime\container-runtime\src\blobManager\blobManagerSnapSum.ts`; `packages\drivers\odsp-driver\src\odspSummaryUploadManager.ts` | Attachment reachability and attachment-ID versus parent-summary-path references.                |
| `packages\runtime\container-runtime\src\blobManager\blobManager.ts`, `getGCData`                                                           | Nonidentity redirects and per-asset GC nodes.                                                   |
| `packages\drivers\odsp-driver\src\createFile\createNewUtils.ts`; `contracts.ts` in the driver directory                                    | Initial creation, loading groups, synthetic cache IDs, and response shape.                      |
| `packages\common\driver-definitions\src\storage.ts`; `packages\drivers\odsp-driver\src\odspDocumentStorageManager.ts`                      | Group fetch, cache bypass, and blob GET; service guarantees are separate.                       |
| `packages\dds\sequence\src\sequenceFactory.ts`; `packages\dds\merge-tree\src\snapshotLoader.ts`; `packages\dds\map\src\directory.ts`       | Native detached construction, sequence-history restoration, and directory incarnation metadata. |
