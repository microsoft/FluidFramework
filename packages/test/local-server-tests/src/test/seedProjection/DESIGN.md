# Application Seeds and Readable Summary Projections

**Status: experimental SharedTree reference implemented; Markdown/rich-text support is a follow-on design.** See the
[reference README](README.md) for the executable flow and validation limits.

Enable applications outside Fluid to create and read collaborative files through a documented application format.
Creators supply application content, feature metadata, and assets; readers consume the application state at a summary
checkpoint without decoding DDS state or replaying operations.

**Collaborative HTML canvases and rich-text documents are the motivating scenarios.** An external producer, including
a Rust-based content generator, should be able to write HTML or Markdown without a native DDS encoder. A collaborating
application should later load that content, support ordinary edits, and keep a readable projection alongside its native
state. The mechanisms are generic, but these creation, collaboration, reading, and asset-management requirements are the
evaluation criteria. The reference models the HTML case without a dependency on a production application.

Creation uses a seed with a valid generic Fluid envelope. An **application-specific container-runtime factory**
deterministically projects its application payload into a native runtime/DDS snapshot in memory. Subsequent summaries
contain both normal Fluid state and an application-readable projection.
**Text and metadata duplication is intentional; image payload duplication is not.**

The initial prototype excludes images and attachments. Single-call asset creation and a supported download format
are separate contracts, not prerequisites for proving runtime conversion.

## Requirements

1. File edits should be submitted only when the user modifies something in the document. Opening a seed must not persist
   initialization, aliases, schema/default changes, or a summary merely to materialize it.
2. Do not break offline support.

## Runtime-owned conversion

**Seed conversion runs in the application's container-runtime factory, before `loadContainerRuntime()`.** Applications
own parsing, schema, and initialization policy, supported by reusable Fluid helpers. Embedding hosts retain
application-agnostic loaders and drivers; an application-specific driver wrapper would couple this work to host
deployments.

```text
Generic host loader and storage driver
  load source snapshot; establish protocol, code, and sequencing state
    -> application IRuntimeFactory.instantiateRuntime
       retain original source snapshot and provenance
       construct native loading snapshot + runtime-local storage overlay
    -> ordinary ContainerRuntime and DDSs, loaded as an existing document
       process normal operations; publish native state + application projection
```

The factory retains the original seed alongside its projected loading view and coordinates fingerprint handling. This is
not a data-store runtime or post-load initialization hook.

- **Loader-valid envelope:** the loader consumes protocol attributes, sequencing, quorum/code details, and application
  code selection before invoking the factory. The seed must satisfy that contract.
- **Coherent runtime view:** adapt `baseSnapshot`, `snapshotWithContents`, and runtime-facing storage together,
  including subsequent snapshot/blob/group reads. Forward context properties, methods, and lifecycle; do not spread the
  context into a plain object.
- **Preserved source:** do not modify loader/driver caches. Retain reconstruction inputs and wrapper state for
  restoration, recognize later native snapshots, and leave operation replay to Fluid.
- **Separate transport capabilities:** the runtime cannot undo payload downloads made before application code loaded.
  Lazy delivery still requires generic loader/driver/service support.

Existing legacy/beta factory interfaces support a constrained prototype without loader changes. Production must cover
all supported loading/restoration modes and provide runtime contracts for safe summaries and fingerprint transport.

## Dependency: a documented interchange file format

**The portable file experience requires a documented, supported interchange format from the storage service.** For an
ODSP deployment, that would be a contract for files downloaded from SharePoint. This is a proposed dependency, not a
claim of an existing capability or service commitment. The format should expose a snapshot-like file tree, blobs as
files, checkpoint metadata, an operation tail, and referenced attachments.

It must support **shared references**: multiple leaves can point to one image payload. ZIP is a possible package, not a
requirement; use documented manifest/reference records rather than relying on archive or operating-system symlink
behavior.

A stable entry point locates the application manifest. References from the selected snapshot must resolve within the
package, without earlier server summaries or private DDS knowledge. Native DDS blobs remain opaque to these readers.

## Stored representations and authority

| Representation | Contents | Authority |
| --- | --- | --- |
| Seed summary | Loader-valid snapshot envelope; versioned application manifest; HTML parts; feature metadata; managed-asset locators | Defines the initial state. Accepted operations extend that state even before a native summary exists. |
| Native summary | Normal Fluid runtime/DDS state; application projection at the same checkpoint; references to the same attachment pool | Native state plus subsequent operations is authoritative. The projection is a read representation, not an alternative write target. |

The application manifest specifies format version, representation kind, ordered parts, supported non-HTML features, and
asset references. Seeds identify an immutable seed and materialization profile; projections identify their checkpoint.

The payload is an **application content package, not necessarily a self-contained ZIP**. Define feature coverage
explicitly: a readable HTML or Markdown export need not be a lossless application backup. Never reconstruct an existing
collaborative document from its read projection while retaining its old operation stream.

## Creation flow

1. **Define the materialization profile.** Version parsing/normalization, schema, text representation, defaults,
   ordering, identifiers, and asset bindings. Derive shared identities from immutable seed inputs and stable traversal,
   not randomness, locale, feature flags, or async completion order. Fix shared ID-compressor initialization; subsequent
   client-local sessions remain distinct. Reject unsupported profiles.

2. **Commit a complete seed.** Store the loader-valid envelope, readable HTML/metadata, seed/profile descriptor, and any
   asset locators. The creator does not encode DDS state. Assets must already be available through the chosen creation
   path; never publish unresolved payload references.

3. **Enter the runtime factory.** Detect and validate the seed in the original `IContainerContext`. Retain its source
   and real storage identity; construct the forwarding context and storage overlay described above. Ordinary native
   snapshots bypass conversion.

4. **Build the native baseline locally.** The application converts content into typed initial state; Fluid-owned
   construction/summary helpers produce the complete DDS/runtime snapshot and blob map, including the application's
   datastores, DDSs, aliases, handles, schema, and shared identity state. The reference uses one datastore and
   SharedTree; richer applications can require a mixed-DDS graph. Do not hand-author private DDS codecs. Record the
   baseline fingerprint.

5. **Load and collaborate.** Use the projected context with `existing: true` at the original reference sequence.
   Preserve document identity, epoch/version, and operation tail; Fluid performs normal replay. Materialization submits
   nothing. User edits produce ordinary DDS operations, with the fingerprint protocol below.

6. **Publish a safe native summary.** Virtual native paths do not exist in the stored seed. A runtime-enforced policy
   must emit full structural state, including DDS chunks and GC, for automatic summaries and retries. Initially retain
   this policy for each seed-loaded runtime's lifetime; fresh native loads use normal incremental behavior. An outer
   runtime wrapper or one manually forced summary is insufficient. Keep the real storage parent and include the
   application projection, genesis descriptor, and existing attachment references without re-uploading payloads.

Later clients load native summaries normally. Existing seed-derived clients continue on the same operation stream;
neither first edits nor the first native summary redefine the initial baseline.

## Application projection during summarization

Add a supported callback that produces an **application-owned root subtree**, outside `.channels`. It serializes a
read-only application view into HTML, feature metadata, and an asset table; later asset support resolves handles to
attachment locators, not bytes.

- **Same checkpoint:** use the summarizer's sequenced state at `R`, not an interactive client's optimistic view. Normal
  summary submission pauses inbound processing; realize required data beforehand and prohibit mutations or schema
  upgrades during capture.
- **Complete coverage:** generate the projection for first and later native summaries and any supported native-attach
  path. A seed already supplies its initial readable state. Account for added summary statistics and reject collisions
  with native entries.
- **Explicit freshness:** regenerate or invalidate on relevant model/schema/asset changes, even when native data-store
  summaries reuse handles. Refresh checkpoint metadata; editor listeners alone are insufficient.
- **Atomic publication:** publish native state, projection, and required attachment reachability together. Fail/retry if
  projection generation fails; never label stale content as current.
- **Independent loading:** use a loading-group ID for the projection where supported, so native loading can exclude its
  bodies. This requires backend support, not just a tagged subtree.

Readers locate the manifest and resolve its documented references. They see state at `R`; interpreting trailing
operations is outside this limited reader contract.

## Images and single-call creation (follow-on)

**One payload pool must serve the seed, native state, and read projection.** Materialization and projection must not
read image bodies; the first native summary must not re-upload them.

The current ODSP attachment creation path uses **empty file -> attachment uploads -> first summary**. Retain that
fallback while pursuing both a documented atomic mixed-summary/attachment create API and the following tactical
alternative.

### Tactical grouped-blob graduation

1. An external, fire-and-forget creator sends one initial summary: ungrouped envelope/HTML/metadata, plus each distinct
   image once in a deferred loading-group subtree. The current create serializer supports tree `groupId` and binary
   blobs, not attachment entries.
2. The manifest maps logical assets to seed-tree paths, MIME types, and digests. Specify paths relative to the runtime
   view: ODSP removes the outer `.app` tree. Storage must return real leaf IDs without image bodies; resolve
   `logical asset -> seed path -> storage ID` at the original checkpoint.
3. Seed BlobManager locally using **deterministic, nonidentity logical-ID -> storage-ID redirects**; DDS handles
   reference the logical IDs. Identity-only mappings omit normal per-asset GC nodes. The application must bind these
   existing handles without fetching or uploading bytes.
4. The accepted native summary retains ordinary attachment references to the same IDs and drops the seed payload
   subtree. Subsequent loading, retention, and GC must work as for normal attachments.

**Creation-path limitation:** this does not cheaply generalize to creation through a Fluid runtime. The ODSP driver can
cache a synthetic snapshot with fake blob IDs, whereas attachment references require real storage IDs. That path needs
authoritative ID readback/remapping; closing the creator does not necessarily remove its cache. Never adopt
cache/overlay IDs or silently substitute a newer checkpoint.

### Service gates and payload rules

Real SPO validation must establish metadata-only grouped loading, attachment GET/reference acceptance, size limits, and
a second cold load after the seed group is removed. Verify retention/GC and measure snapshot payload bytes, not just
direct blob-read calls. Group-aware loading requires loader/driver support; local simulations and mocked component
checks do not establish these service guarantees.

The tactical path may work without new SPO implementation, but only after those gates pass. The documented mixed-payload
API remains useful independently.

- **Deduplicate content, not identity:** identical compatible images share bytes; logical names and placements remain
  distinct. Digest metadata avoids reading bytes during materialization.
- **Reference-only representations:** HTML, feature metadata, and projections use asset references, not data URLs or
  embedded self-contained archives. Use a reference-only exporter rather than one that resolves image bytes.
- **Export once:** include each referenced payload once in the interchange package. A conventional standalone
  application archive can be assembled separately.
- **Preserve reachability:** string locators are not Fluid GC edges. Account for native, projection, and
  retained-history references; remove obsolete projection references when regenerated.
- **Normal edits:** upload a genuinely new image once, then reference it from both representations. Existing inline
  images need explicit write-time migration, not re-upload disguised as graduation.

Attachments enable lazy loading and ODSP caching; browser HTTP caching depends on response headers. No cross-file
deduplication guarantee is assumed.

**Migration constraint:** image bytes embedded inside a DDS blob or HTML data URL are not separately addressable image
blobs. Such files need explicit migration and readers that understand attachment references. New seeds should separate
payloads upfront. Storage improvements also do not automatically remove any application-level image conversion or
transport costs.

## First-operation fingerprint

Piggyback `(seedId, profileVersion, hashVersion, baselineHash)` on
**each seed-derived writer's first actual operation/batch**, without an initialization operation. Hash the produced
initial shared state before edits: operation-relevant topology, types, identities, and asset bindings. Version
canonicalization; exclude client-local and checksum fields. Persist the descriptor outside the hashed DDS state in
native summaries.

**Stamping the first transport callback once is insufficient.** Grouping, compression, chunking, pending-state capture,
and resubmission must preserve or reconstruct the proof without overwriting existing metadata. Define missing-proof,
reconnect, and replay behavior through a tested transport protocol or generic runtime metadata support.

Validate before native processing against the locally computed or persisted descriptor; record both hashes and
seed/profile identity on mismatch. This is diagnostic evidence, not authentication or prevention of incompatible
operations being sequenced. Define failure/recovery behavior that preserves user work.

## Execution plan: reference prototype, then production PRs

**Combine the first four work items into one end-to-end reference prototype before splitting production changes.** The
goal is architectural confidence and a runnable example that reviewers can understand, not four isolated APIs. Exclude
the separate browser application: the readable headless integration scenario is the sample.

Use one data store and SharedTree, manifest/HTML summary blobs, and a bounded HTML parser.
**No images, attachments, or production-application dependency.** Internal/experimental helpers are acceptable; mocked
DDS collaboration or summary acceptance is not.

### Combined prototype

| Component | Work |
| --- | --- |
| Deterministic native bootstrap | Restricted HTML parser/serializer and typed tree schema; native snapshot construction helpers; complete single-store runtime envelope and compressor state; stable initial identities and canonical baseline fingerprints. |
| Runtime-owned loading | Seed-aware factory with a delegate native factory, coherent snapshot/storage overlay, original checkpoint/provenance retention, restoration support, and native-snapshot bypass. |
| Safe native summaries | Runtime-enforced full structural summaries for seed-loaded instances, including automatic attempts and retries; unchanged incremental behavior for ordinary native loads. |
| Application projection | Additive, initially synchronous root-summary callback; collision checks, statistics, failure propagation, and same-checkpoint capture. Tag its subtree with a loading-group ID. |

The central test should expose this flow through small named helpers:

```text
Create an HTML/metadata seed without a native application container
  -> clients A and B independently materialize it
  -> concurrent SharedTree edits converge
  -> normal summarizer publishes an accepted native summary + app projection
  -> client C loads native state with seed conversion disabled
  -> further edits produce a refreshed readable projection
```

Verify zero initialization writes, compatible independent baselines with distinct live sessions, no persisted references
to virtual paths, and projection content matching the accepted checkpoint. Exercise invalid inputs, callback failures,
summary retries, and pending-state restoration without the original in-memory overlay. Compute fingerprints now; durable
first-operation transport remains follow-on work.

### Backend-independent validation

Start with **Memorylicious: `LocalDeltaConnectionServer` plus `local-driver`**, with clients sharing the same in-process
server. Enable `Fluid.Container.UseLoadingGroupIdForSnapshotFetch2` for interactive and summarizer loaders. Verify that
the custom projection subtree retains its blob IDs while its bodies are omitted, and can be retrieved explicitly.

Keep driver/resolver selection, external seed creation, configuration, and storage observation behind backend adapters;
share the runtime/projector and scenario. Existing test-driver seams support later Tinylicious and real ODSP runs.
Separate universal correctness, loading-group capability, and actual payload-omission assertions. Local omission proves
client handling, not SPO guarantees; Tinylicious can run the core flow before gaining group support.

### Production extraction and follow-on work

Treat the combined change as a reference, not a commitment to merge it wholesale. After the complete flow works, extract
and refine smaller production PRs around the demonstrated contracts. Preserve the end-to-end scenario as the acceptance
target; do not restart implementation merely to recreate smaller changes.

Add asset adoption later, first in SDK tests and then through the real SPO gates above. Application integration supplies
schema/profile adapters and reference-only exporters; normal multi-call attachment creation remains available until
single-call graduation is proven. ODSP interchange and mixed-payload contracts can progress independently. Browser UI,
idle summarization, and flat-only storage are not prerequisites.

## Markdown/rich-text follow-on

**The goal is direct creation by a non-Fluid producer, without calling a document-conversion service or knowing DDS
formats.** A Rust or other producer writes Markdown and documented, versioned application metadata inside the supported
seed/file envelope directly to storage.

The rich-text application's runtime factory must materialize its complete native graph locally, including SharedString,
other DDSs, and existing aliases. Ordinary collaboration then produces native summaries containing both that model and a
same-checkpoint Markdown projection. The creator knows the seed/envelope and storage contracts, not how to construct
that graph. Headless services may subsequently load or edit the file, but are not required for creation or
materialization.

### Native construction

A rich-text application can have aliased metadata/document roots and handle-reachable body and title editors.
SharedDirectory/SharedMap can hold root and feature state, while SharedString holds text, markers, and intervals.
Lists, nested sequences, and embedded components may add channels or datastores. The seed profile must define the
chosen graph; registered factories do not all need instances.

**Aliases need graph construction, not a new alias protocol.** Existing Fluid loaders accept already-aliased native
state. A runtime-owned builder must produce aliases together with datastore identities, registry paths, root flags,
handles, and GC reachability. Writing `.aliases` alone is insufficient; calling `trySetAlias()` during real document
boot violates the no-initialization-write requirement.

SharedString and the simpler DDSs already provide native factories and serializers. Populate a genuinely detached
construction environment, then serialize and discard it; an attached-but-disconnected runtime with suppressed output can
retain pending operations. Preserve marker/interval identities and SharedDirectory incarnation metadata. Markdown can
define a fresh baseline, not replace native collaboration-window history.

**Application initialization needs a deterministic construction contract.** Interactive creation may generate random
IDs, inherit host locale and attribution, or create children asynchronously. Lazy repair of missing state must not run
during seed loading. Pin parser/sanitizer, model profile, locale, attribution, and allocation rules; construct the
complete selected graph before normal loading. Do not monkeypatch global randomness or assume an ordinary paste API
already has the required construction semantics.

### Read-only Markdown projection

Body-only Markdown export is not a complete document projection. Preserve title and supported non-Markdown state in a
versioned sidecar; Markdown round trips can normalize content and need not retain all native identities or features.

**Pausing Fluid operations does not necessarily synchronize a derived application model.** Applications that resolve
references or update model caches asynchronously need an additional synchronization barrier. Likewise, an exporter that
loads components, performs migrations, or fetches external data is not automatically a read-only checkpoint capture.
Use an application synchronization barrier plus immutable capture, or a read-only model of the frozen native checkpoint.
Render Markdown only from captured state; explicitly report unsupported features and failures rather than silently
publishing placeholders.

Start a later rich-text proof with paragraphs, headings, basic formatting, ordinary links, and explicit title/profile
metadata. Add lists after deterministic allocation and map-model synchronization are covered; defer rich components,
comments, and assets. Validate independent construction, no-write opens, native convergence/reload, and projection
consistency under delayed application callbacks.

This is a follow-on design, not an executed rich-text prototype. It does not expand the SharedTree reference.

## Optional: summarize when collaboration ends

A worker could consume documented session-end or idle notifications, run a headless application session, catch up, and
publish an accepted native summary plus projection. Notification and worker support remain service-specific
dependencies.

Only summarize unpublished document edits; opening/closing an unchanged file must not convert its seed. Coalesce
notifications, retry failures, avoid self-triggered loops, and use the normal summary protocol.
**Freshness at rest is eventual**, not guaranteed at session close; retain the explicit checkpoint.

## Longer-term direction: application content as the stored file

A future file could contain only application content, feature metadata, and shared assets,
**without embedded Fluid state**. An application-specific service would own recoverable collaboration sessions
separately from the canonical application file.

This requires safe bidirectional transitions, session authority, in-flight operation handling, failure recovery, and
stale-writer fencing. The canonical format must cover all required features, beyond a limited HTML or Markdown
projection.

**Seeds and projections are useful independently of that destination.** This proposal, including its idle worker,
retains native Fluid persistence; easier creation and reading do not depend on replacing it.

## Source starting points

Reviewed against Fluid Framework `63e64bf06cd3129e7335d288c830b1d716259f84`, before this reference's changes.
Paths are relative to this repository root.

| File / symbol | Relevance |
| --- | --- |
| `packages\common\container-definitions\src\runtime.ts`; `packages\loader\container-loader\src\container.ts` | Factory/context contracts and protocol processing before application runtime loading. |
| `packages\runtime\container-runtime\src\containerRuntime.ts`; `packages\loader\container-loader\src\serializedStateManager.ts` | Projected runtime inputs versus loader-owned source, replay, summary policy, and checkpoint barrier. |
| `packages\dds\tree\src\treeFactory.ts`; `packages\dds\tree\src\shared-tree-core\sharedTreeCore.ts` | Native tree construction and summary machinery. |
| `packages\runtime\container-runtime\src\summary\summarizerNode\summarizerNode.ts`; `packages\dds\tree\src\feature-libraries\forest-summary\incrementalSummaryBuilder.ts` | Previous-summary handle/chunk reuse and full structural emission. |
| `packages\runtime\container-runtime\src\blobManager\blobManagerSnapSum.ts`; `packages\drivers\odsp-driver\src\odspSummaryUploadManager.ts` | Attachment reachability and attachment-ID versus parent-path references. |
| `packages\runtime\container-runtime\src\blobManager\blobManager.ts` / `getGCData` | Nonidentity redirects required for normal per-asset GC nodes. |
| `packages\drivers\odsp-driver\src\createFile\createNewUtils.ts`; `contracts.ts` in the driver source directory | Initial create serialization, loading groups, synthetic cache IDs, and create-response shape. |
| `packages\common\driver-definitions\src\storage.ts`; `packages\drivers\odsp-driver\src\odspDocumentStorageManager.ts` | Group-fetch contract, cache bypass, and blob GET; service guarantees remain separate. |
| `packages\test\local-server-tests\src\test\utils.ts`, `decoupledCreate.spec.ts`, and `sharedTreeConstraints.spec.ts` | Single-repo prototype harness, out-of-band creation, and real multi-client SharedTree tests. |
| `packages\runtime\container-runtime\src\opLifecycle\outbox.ts`, `opGroupingManager.ts`, and `opSplitter.ts` | Why first-operation proof needs an explicit grouping/chunking/resubmission contract. |
| `packages\dds\sequence\src\sequenceFactory.ts`; `packages\dds\merge-tree\src\snapshotLoader.ts`; `packages\dds\map\src\directory.ts` | Native detached construction, sequence-history restoration, and directory incarnation metadata. |
