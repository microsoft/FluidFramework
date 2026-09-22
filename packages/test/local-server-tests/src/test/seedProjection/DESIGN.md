# Application Seed Projection: Implemented Fluid Design

This document describes the implemented reference and remaining work directly related to its Fluid contracts.
[ARCHITECTURE.md](ARCHITECTURE.md) separates the wider application/storage direction, attachment proposals,
portable downloads, Markdown integration, and optional background services. [README.md](README.md) explains how to run
and navigate the example.

## Implemented scope

One data store contains one real SharedTree with **two independently reusable HTML-part subtrees**. An external
producer creates a loader-valid file from application content without instantiating a Fluid Container or encoding DDS
state. The application runtime constructs that state locally; ordinary operations and accepted summaries then maintain
both the collaborative model and the readable HTML projection.

The reference contains no images or attachment migration. Application seeds and projections are uncompressed trees of
blobs; an outer portable-download archive is a separate storage concern.

| Component | Implemented behavior |
| --- | --- |
| External creation/readback | Versioned manifest and two HTML blobs; the same external reader consumes seed and accepted native snapshots without loading a runtime. |
| Deterministic bootstrap | Bounded HTML codec, typed SharedTree schema, native DDS/compressor serializers, complete single-store fixture envelope, stable initial identities and fingerprint. |
| Runtime-owned loading | Seed-aware factory, coherent snapshot/storage overlay, retained source provenance, no initialization writes, and pending-state reconstruction. |
| Native summaries | Full structural native/GC state through the first tracked accepted summary, then incremental generation in the same runtime. |
| Application summaries | Synchronous checkpoint capture, proposal-specific acceptance, dirty-part tracking, subtree-handle reuse, and loading-group metadata. |
| Real lifecycle | Independent clients, concurrent edits, failed summary/retry, storage upload/ACK, native reload, and grouped readback against Memorylicious. |

Opening a file from an initial snapshot containing only seed data must not persist initialization, aliases, schema
defaults, or a summary merely to render it and allow editing. Only actual user edits initiate document writes.
Restoration must reconstruct the same baseline and preserve pending edits rather than depend on a discarded overlay.

## Runtime-owned conversion

**Conversion runs in the application's `IRuntimeFactory`, before `loadContainerRuntime()`.** Parsing, schema,
and deterministic initialization belong to the application. The loader retains responsibility for protocol state,
document/version identity, and replay of the sequenced operation suffix.

```text
Load original seed snapshot and protocol
  -> application runtime factory reads application blobs
  -> construct a deterministic native snapshot and runtime-local storage overlay
  -> load ContainerRuntime as an existing document at the original checkpoint
  -> ordinary collaboration
  -> first accepted full native summary + readable projection
  -> incremental native/projection summaries in the same runtime
  -> later clients load the persisted native model directly
```

The adapter forwards the original context's live properties and method receivers. It overlays `baseSnapshot`,
`snapshotWithContents`, and storage reads consistently; it does not modify loader/driver caches or replay operations
itself. Group-only fetches are not substituted for the complete native loading snapshot.

**After a native summary exists, loading that summary does not rebuild a model from HTML.** The factory recognizes
persisted native metadata and loads the stored runtime/DDS state directly, followed by normal operation replay.
The readable projection is not an alternate write authority.

Loading groups address transport, not conversion: if storage includes every HTML body in the initial snapshot response,
those bytes have already crossed the network before the factory runs. The adapter cannot avoid that transfer.
Saving download bytes requires the driver/service to omit unrequested group bodies while retaining their IDs.

The implementation uses the existing runtime-factory loading boundary without loader changes and adds summary-generation
options to ContainerRuntime. Its exact tested and untested loading cases are listed below, rather than relying on an
unspecified production-readiness claim.

## File format and native baseline

`fluid-html-reference/2` stores `manifest.work`, `first/document.html`, and `second/document.html` under
`applicationProjection`. `HtmlDocument.first` and `.second` are distinct SharedTree child arrays. The pure codec rejects
unsupported HTML rather than silently dropping content. Creation and external reading import no DDS/runtime.

`nativeSeedBaseline.ts` is a test-internal fixture builder, not a new public native-file encoder. Real SharedTree and
compressor serializers own their formats. The fixture specifies the enclosing runtime/store/channel envelope, including
the persisted root alias. Loading never calls alias assignment or creates a replacement graph.

Compatible inputs use a fixed, finalized genesis compressor session serialized without a live session. Each loaded
client receives a different live compressor session. Pinned schema/codec/profile and deterministic traversal must not
depend on wall clock, random IDs, host locale, or asynchronous completion order.

The baseline fingerprint is a lowercase SHA-256 of the ordered native snapshot, whose content-addressed virtual blob IDs
bind the payload bytes. It captures the initial graph and checkpoint, not later edits or client-local state. Fingerprint
transport and validation are specified separately from construction so a local equality assertion is not mistaken for
an operation-level compatibility check.

## First full summary, then incremental native state

Virtual loading paths do not exist in storage. `summaryGenerationOptions.fullTreeUntilFirstAck` therefore requests full
structural native state, including GC, until a tracked full proposal is successfully adopted.

Full tracked generation still records pending native baselines. `ContainerRuntime.refreshLatestSummaryAck` coordinates
their adoption with the **matching proposal's GC state**, the actual accepted storage parent, and the application
acceptance callback. Only then does initial forcing end. Generation, upload, submission, NACK, or an untracked/remote
ACK does not establish this baseline.

Proposal-keyed state handles retries, delayed ACKs, and attempts at equal checkpoints. Duplicate ACKs do not promote
application state twice. Errors during native/GC/application adoption fail closed rather than continue with inconsistent
reuse baselines. The existing `forceFullTree` option remains an unconditional override; the example does not use it.

The lifecycle asserts that the same seed-loaded runtime's second accepted summary already contains native handles.
This proves structural incremental reuse, not that the first full forest encoding has primed every SharedTree
chunk-level encoding optimization.

## Incremental application projection

`additionalRootTree` adds an application-owned child beside `.channels`, with key validation, statistics, group
metadata, and explicit failure propagation. The key is currently application-selected; a uniform discovery convention
and optional application-authored `AGENTS.md` remain
[open design questions](ARCHITECTURE.md#projection-discovery-open-design).

The synchronous callback receives `SummaryGenerationContext`: checkpoint, effective full-tree/tracking mode, and the
exact accepted parent. It returns `AdditionalSummaryTree`, containing a tree and optional proposal-specific
`onAccepted` callback. Callbacks must not mutate the model, run asynchronous work, or start schema upgrades.
Capture uses the summarizer's sequenced state while incoming processing is paused, not an interactive client's
optimistic pending edits. The root callback also runs when unchanged native descendants reuse handles.

`IncrementalHtmlProjection` subscribes to each part's native subtree, the structural parent, and document-root
replacement. It checks local dirty counters **before traversing or serializing HTML**, and captures those counters with
the proposal. Acceptance promotes captured counters, never the current counters at ACK time; edits during upload remain
dirty.

An unchanged part with a matching accepted parent becomes a subtree handle at
`/applicationProjection/first` or `/applicationProjection/second`. The storage driver resolves that path in the upload's
accepted parent. This avoids both HTML encoding and payload upload; it is not a content hash or a virtual blob ID.
The small fixed manifest is regenerated.

Unaccepted attempts cannot become reuse baselines. Unknown parents, full requests, and untracked generation emit
complete projection content. A newly loaded instance conservatively establishes its own accepted dirty-counter baseline
instead of comparing local event counts across clients. Replacing/moving content invalidates the corresponding parts.

The real lifecycle edits only the first part and checks all three properties of the second: no additional serializer
calls, a handle rather than payload in the submitted summary, and an unchanged persisted HTML blob ID after acceptance.
Both parts remain readable through the external reader, including when loading groups omit their bodies initially.

## Loading, restoration, and remaining SDK work

Implemented coverage includes independent interactive/summarizer loads from a seed, op-suffix replay, native loads with
conversion disabled, storage refetch, and pending-state restoration with seed-body reads denied. The pending envelope
retains original manifest/part bytes and their storage IDs; regenerated native blobs are not serialized into host
caches. Tests cover initial `ISnapshot` and tree-only loads, restoring either through the snapshot-based loader path.

Memorylicious uses one real `LocalDeltaConnectionServer` and local-driver for clients, storage, sequencing, and ACKs.
`SeedWorkflowBackend` separates creation, inspection, driver, and group capabilities so the scenario can later run on
other services. Group support and guaranteed omission of unrequested bodies are separate capabilities.

The following remain outside the demonstrated SDK coverage; they are not hidden behind "all loading modes":

- Arbitrary multi-DDS graphs and production application schemas; the current fixture has one store/SharedTree.
- Native DDSs in loading groups; only the application projection is grouped here.
- Mixed-version materialization profiles and upgrade/recovery behavior.
- The wider offline matrix, including restoration across native graduation, schema changes, and attachment lifecycles.
- Real ODSP/Tinylicious backend validation; Memorylicious behavior does not establish their transport guarantees.

The exposed generation options and test-internal construction fixture should be reviewed on their own API merits.
This document makes no prescribed PR count or requirement to discard and reimplement the working reference.
