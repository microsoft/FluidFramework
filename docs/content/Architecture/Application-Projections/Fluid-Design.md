# Application Projections: Implemented Fluid Design

This document describes the implemented Fluid contracts and why the runtime changes are required.
The [architecture and roadmap](../Application-Projections.md) separates the wider application/storage direction, attachment proposals, portable downloads, Markdown integration, and at-rest summarization.
The [usage guide](./Usage.md) explains application integration; the [reference README](../../../../packages/test/local-server-tests/src/test/seedProjection/README.md) explains how to run the example.
Sample-application and test-harness structure belongs in the [local design](../../../../packages/test/local-server-tests/src/test/seedProjection/DESIGN.md), not in the runtime contract.

## Implemented scope

Here, DDS means distributed data structure, GC means garbage collection, and ACK means a service acknowledgment of a summary proposal.
Receiving an ACK and successfully adopting its state are distinct steps.

One data store contains one real SharedTree with **two independently reusable HTML-part subtrees**. An external
producer creates a loader-valid file from application content without instantiating a Fluid Container or encoding DDS
state. The application runtime constructs that state locally; ordinary operations and accepted summaries then maintain
both the collaborative model and the readable HTML projection.

The reference contains no images or attachment migration. Application seeds and projections are uncompressed trees of
blobs; an outer portable-download archive is a separate storage concern.

| Component                  | Implemented behavior                                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| External creation/readback | Two HTML blobs and optional application-owned metadata; the same external reader consumes seed and accepted native snapshots without loading a runtime.            |
| Deterministic bootstrap    | Bounded HTML codec, typed SharedTree schema, native DDS/compressor serializers, complete single-store fixture envelope, stable initial identities and fingerprint. |
| Runtime-owned loading      | Seed-aware factory, coherent snapshot/storage overlay, retained source provenance, no initialization writes, and pending-state reconstruction.                     |
| Native summaries           | Full structural native/GC state through the first tracked accepted summary, then incremental generation in the same runtime.                                       |
| Application summaries      | Synchronous checkpoint capture, proposal-specific acceptance, dirty-part tracking, subtree-handle reuse, and loading-group metadata.                               |
| Real lifecycle             | Independent clients, concurrent edits, failed summary/retry, storage upload/ACK, native reload, and grouped readback against Memorylicious.                        |

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

The HTML application stores `first/document.html` and `second/document.html` under `applicationProjection`.
Its optional `manifest.json` uses the example-specific format identifier `reference-html-parts/1`.
That file and identifier are application choices, not a required Fluid manifest or a selector for native reconstruction.
The sample also accepts manifest-free content and preserves application metadata without treating it as runtime configuration.
`HtmlDocument.first` and `.second` are distinct SharedTree child arrays.
The pure codec rejects unsupported HTML rather than silently dropping content.
Creation and external reading import no DDS/runtime.

The three identities are independent:

| Identity                    | Sample choice                                                     | Meaning                                                                        |
| --------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| External application format | `externalHtmlFormat = "reference-html-parts/1"`                   | Interpretation of the sample's optional application manifest.                  |
| Materialization rules       | `htmlMaterializationProfile = "reference-html-materialization/1"` | Application-internal deterministic reconstruction contract.                    |
| SharedTree namespace        | `htmlSchemaNamespace = "fluid-html-reference/2"`                  | Stable native schema identifiers, preserved independently of the other labels. |

`IProjector.materializationProfile` is supplied by application code, never selected from external metadata.
Clients must agree on the profile even when two profiles happen to produce identical native bytes for a particular input.
The same schema can support different reconstruction rules; native schema naming is not a materialization-version scheme.

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

`seedBaselineFingerprint.ts` defines a descriptor containing `seedId`, `profileVersion`, `hashVersion`, and `baselineHash`.
`profileVersion` carries the application's internal materialization identity, not an external manifest version.
The descriptor is derived from the original seed provenance and persisted at `.channels/document/.channels/seed-baseline.json`, outside the readable application projection.
Clients loading later native summaries retain that original genesis descriptor; they do not hash the edited model as a new baseline.

The sample's `FluidDataStoreRuntime` subclass appends this immutable native blob through public `summarize` and `getAttachSummary` overrides.
`addBlobToSummary` includes its statistics, and whole-store incremental handles retain it in subsequent summaries.
The canonical initial native hash is computed before adding this descriptor, avoiding a circular hash.
There is no extra DDS, initialization operation, or private runtime interception.
The descriptor remains native/protocol metadata, not secret storage.

Earlier prototype files using `manifest.work` or only an exported baseline descriptor are rejected explicitly.
This revision does not silently reinterpret those layouts or implement migration.

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
persistence through native reloads.
Mixed-version deployment/recovery remains separate validation work.
No new public ContainerRuntime API is required for this application-level protocol.

### Packet-size accounting: agreed follow-up

Exact packet-budget accounting for metadata added after native batching remains a documented follow-up, not a property established by this reference.
Native Outbox admission estimates content size plus a fixed per-message overhead; it does not plan the final stamped transport representation.
A read-only core probe with a synthetic 1,024-byte cap admitted an estimate of 1,023 bytes, while adding a valid descriptor grew event-data JSON from 942 to 1,223 UTF-8 bytes, before further transport framing.
This is evidence of missing headroom accounting, not a measurement of a production service limit.

Do not add a late throwing guard in the application wrapper as a substitute.
The native path can already have popped a batch and emitted intermediate chunks before registering pending-operation ownership.
A safe fix needs native packet planning/accounting and failure-safe pending ownership before transport effects.
This reference does not implement that broader native transport work.

## First full summary, then incremental native state

Virtual loading paths do not exist in storage.
Setting `summaryGenerationOptions.fullTreePolicy` to `"untilFirstAck"` therefore requests full structural native state, including GC, until a tracked full proposal is successfully adopted.

Full tracked generation still records pending native baselines. `ContainerRuntime.refreshLatestSummaryAck` coordinates
their adoption with the **matching proposal's GC state**, the actual accepted storage parent, and the application
acceptance callback. Only then does initial forcing end. Generation, upload, submission, NACK, or an untracked/remote
ACK does not establish this baseline.

Proposal-keyed state handles retries, delayed ACKs, and attempts at equal checkpoints. Duplicate ACKs do not promote
application state twice. Errors during native/GC/application adoption fail closed rather than continue with inconsistent
reuse baselines. The alternative `"always"` policy requires full output for every summary; the example does not use it.
The default policy preserves normal summary behavior, including explicit per-attempt full-tree requests.

The lifecycle asserts that the same seed-loaded runtime's second accepted summary already contains native handles.
This proves structural incremental reuse, not that the first full forest encoding has primed every SharedTree
chunk-level encoding optimization.

## Runtime and GC implementation

The generic [summary-generation and acceptance design](../../../../packages/runtime/container-runtime/Summary-Generation.md) owns full output versus tracking, proposal-correlated GC state, coordinated acceptance, and recovery generations.
It explains the late-acknowledgment failure that a single pending GC slot cannot handle, and links the runtime/GC implementation to its focused regressions.
Those capabilities do not depend on seeds, HTML, an application manifest, or a specific schema.

This application uses them because its materialized loading view is not yet a stored native parent.
The [reference scenarios](../../../../packages/test/local-server-tests/src/test/seedProjection/README.md#what-the-scenario-checks) separately verify real storage upload/ACK, native handle reuse, skipped HTML serialization, and unchanged persisted part IDs.

## Incremental application projection

`additionalRootTree` adds an application-owned child beside `.channels`, with key validation, statistics, group metadata, and explicit failure propagation.
The key remains application-selected; `applicationProjection` is a convention.
The [discovery contract](../Application-Projections.md#projection-discovery) permits optional application-owned manifests and `AGENTS.md` without requiring either or interpreting their contents.

The synchronous callback receives `ISummaryGenerationContext`: checkpoint, effective full-tree/tracking mode, and the
exact accepted parent. It returns `IApplicationProjectionSummary`, containing a tree and optional proposal-specific
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
The optional application manifest is preserved byte-for-byte, including custom metadata; manifest absence remains absence.

Unaccepted attempts cannot become reuse baselines. Unknown parents, full requests, and untracked generation emit
complete projection content. A newly loaded instance conservatively establishes its own accepted dirty-counter baseline
instead of comparing local event counts across clients. Replacing/moving content invalidates the corresponding parts.

The real lifecycle edits only the first part and checks all three properties of the second: no additional serializer
calls, a handle rather than payload in the submitted summary, and an unchanged persisted HTML blob ID after acceptance.
Both parts remain readable through the external reader, including when loading groups omit their bodies initially.

## Loading, restoration, and remaining SDK work

Implemented coverage includes independent interactive/summarizer loads from a seed, op-suffix replay, native loads with
conversion disabled, storage refetch, and pending-state restoration with seed-body reads denied. The pending envelope
retains original application metadata/part bytes and their storage IDs; regenerated native blobs are not serialized into host
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

## API and implementation boundaries

The generation options are an exposed API surface with release tags matching their containing loading API.
They are not internal-only merely because one consumer lives in a test package.
Normal workspace builds, lint, and generated API checks remain necessary; the reference's optional source loader only addresses stale local outputs.

The application-side changes solve different problems and do not require new Loader or driver conversion APIs:

| Mechanism                                        | Why it exists                                                                                                                          | Scope                                                                              |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Runtime-local snapshot/storage overlay           | Make deterministic native state visible to normal loading without mutating host caches or replaying the operation suffix twice.        | Application runtime-factory integration.                                           |
| Retained source and pending envelope             | Reconstruct the same baseline after the old overlay disappears, without losing pending work or substituting another source checkpoint. | Application restore/compatibility protocol.                                        |
| Baseline proof and persisted genesis descriptor  | Reject incompatible reconstruction before native packet processing, including reconnect and native-summary reload.                     | Application packet/pending-state protocol, not a new ContainerRuntime API.         |
| Dirty counters and captured acceptance revisions | Avoid serialization before it happens, and avoid marking edits made during upload as already summarized.                               | Application projection implementation consuming the runtime callback contract.     |
| Generic inspectable storage adapter              | Observe actual upload attempts and persisted IDs without coupling lifecycle tests to one application or driver.                        | Test instrumentation, not application runtime code or a storage-service guarantee. |

The [local design](../../../../packages/test/local-server-tests/src/test/seedProjection/DESIGN.md) owns the application/test module map, native construction fixture limitations, and storage instrumentation details.
Keep enduring implementation rationale here; use the PR description as a concise review entry point linking to these contracts.
