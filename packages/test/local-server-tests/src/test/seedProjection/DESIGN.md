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

## Baseline proof on operation packets

`seedBaselineFingerprint.ts` defines a descriptor containing `seedId`, `profileVersion`, `hashVersion`, and
`baselineHash`. It is derived from the original seed provenance and persisted in
`applicationProjection/seed-baseline.json`, outside the native graph being hashed. Clients loading later native
summaries retain that original genesis descriptor; they do not hash the edited model as a new baseline.

The factory adapter adds `seedBaseline` metadata to **every physical outgoing runtime operation packet** after native
grouping, compression, and chunking. Repeating the proof deliberately avoids fragile "already sent once" state:
the writer's first real operation is covered, and reconnect/resubmission reconstructs the same proof without an
initialization operation. Existing batch/transport metadata is preserved. An older context without `submitBatchFn`
retains its legacy `submitFn` path rather than advertising a capability it lacks.

A forwarding `IRuntime.process` validates operation packets before handing them to native decoding or application,
including accepted legacy unpacked runtime envelopes. Genuine service/control messages do not require the proof.
Enforced restoration rejects missing, unrecognized, or incompatible pending-state proof before constructing the native
runtime. The retained application envelope binds the pending work to its original baseline and source dependencies.

For a loaded runtime, a mismatch captures local pending work and diagnostic identity/checkpoint information, then closes
without disposing the application model. A failed restoration retains the rejected pending input before constructing
any model. Pending application content is not telemetry. The recovery artifact is a **runtime
pending envelope, not a complete Loader restoration string**; the host can offer explicit recovery/export, but must not
automatically replay incompatible work into another model. Driver version identity is retained where the driver exposes
it; projected recovery also retains source bytes and provenance.

Validation is **per packet**, not a rollback protocol. A grouped/compressed/chunked operation reaches native application
only after its carrier packets are validated. With deliberately mixed-proof ungrouped operations, an earlier compatible
operation can already have applied when a later invalid packet closes the container; that earlier edit is not rolled
back. The invalid packet itself never enters native processing.

This detects incompatible reconstruction, not malicious peers or incompatible operations before the service sequences
them. The reference exercises real Loader dispatch, transport modes, reconnect, pending recovery, and descriptor
persistence through native reloads. Maximum-packet-size overhead and mixed-version deployment/recovery remain separate
validation work. No new public ContainerRuntime API is required for this application-level protocol.

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
`IInspectableStorageAdapter` separates creation, inspection, driver, and group capabilities so the scenario can later
run on other services. Group support and guaranteed omission of unrequested bodies are separate capabilities.

The following remain outside the demonstrated SDK coverage; they are not hidden behind "all loading modes":

- Arbitrary multi-DDS graphs and production application schemas; the current fixture has one store/SharedTree.
- Native DDSs in loading groups; only the application projection is grouped here.
- Mixed-version materialization profiles and upgrade/recovery behavior.
- The wider offline matrix, including restoration across native graduation, schema changes, and attachment lifecycles.
- Real ODSP/Tinylicious backend validation; Memorylicious behavior does not establish their transport guarantees.

The exposed generation options and test-internal construction fixture should be reviewed on their own API merits.
This document makes no prescribed PR count or requirement to discard and reimplement the working reference.

## Implementation map

| Module | Maintainer responsibility |
| --- | --- |
| `externalSeedFile.ts` | Pure creation/readback contract and application summary subtree. |
| `htmlSeedFormat.ts` | Restricted parser and canonical serializer; explicitly not a browser HTML parser. |
| `htmlTreeSchema.ts` | Native recursive element/attribute/ordered-child/text schema and synchronous conversion. |
| `nativeSeedBaseline.ts` | Test-internal complete native envelope; real DDS/compressor serializers own their codecs. |
| `seedRuntimeAdapter.ts` | Context forwarding, coherent overlay/refetch, original source, and pending reconstruction. |
| `seedBaselineFingerprint.ts` | Genesis descriptor, operation-packet proof, mismatch evidence, and native-summary sidecar. |
| `sampleRuntimeFactory.ts` | Data-store registration and model realization on every client, including summarizers. |
| `incrementalHtmlProjection.ts` | Per-part dirtiness, captured revisions, and accepted-parent subtree handles. |
| `seedProjectionWorkflow.ts` | Backend-neutral lifecycle assertions and instrumentation. |
| `inspectableStorageAdapter.ts` | Generic driver/resolver wrapper, external creation, storage inspection, and per-document upload journal. |
| `localSeedWorkflowBackend.ts` | Memorylicious setup with local-driver and a shared `LocalDeltaConnectionServer`. |

The disconnected construction mock is only a host for building/serializing a baseline, never the collaboration or
summary service. The baseline determines store count; registering a factory does not instantiate another store.

The backend's upload journal is append-only across files and records attempts, including failed calls, but excludes
external creation. It is neither an accepted-summary inventory nor a latest-version cache. Each inspection opens a
separate storage connection and must be disposed. Group-only responses and tree-only snapshot normalization must
preserve the distinction between a whole native base and a selected application sidecar.

The generation options are an exposed API surface with release tags matching their containing loading API, not
internal-only merely because the sample lives in a test package. Normal workspace build, lint, and generated API checks
remain necessary; the README's optional source loader only addresses stale local outputs.

### Generic storage instrumentation

`createInspectableStorageAdapter()` accepts a configured `IDocumentServiceFactory`, its `IUrlResolver`, a fresh
driver-specific creation-request callback, explicit group capability flags, and optional cleanup. The resolver interface
does not define a universal create-new request; the host supplies that path/auth/header setup.
`createLocalSeedBackend()` only supplies Memorylicious configuration to this common adapter.

Client connections are wrapped with the shared `wrapObjectAndOverride` test helper, intercepting storage
`uploadSummaryWithContext` calls and preserving each service's document identity. External creation and independent
inspection use the raw factory and therefore do not pollute the client upload journal. No application/seed format
knowledge is needed in the adapter. The shared helper is exported from `test-runtime-utils`; its existing E2E import
path remains a re-export.

Inspection currently requires the driver's `getSnapshot` capability and fails explicitly when absent. A future
tree-only normalization path must define checkpoint/body semantics rather than synthesize a successful snapshot
with invented metadata. Configuring an ODSP driver in this wrapper is not itself real-service validation.
