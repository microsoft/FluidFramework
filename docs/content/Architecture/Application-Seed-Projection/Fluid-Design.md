# Application Seed Projection: Implemented Fluid Design

This document describes the implemented Fluid contracts and why the runtime changes are required.
The [architecture and roadmap](../Application-Seed-Projection.md) separates the wider application/storage direction, attachment proposals, portable downloads, Markdown integration, and optional background services.
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
| External creation/readback | Versioned manifest and two HTML blobs; the same external reader consumes seed and accepted native snapshots without loading a runtime.                             |
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

## Why the runtime and GC changes are required

The seed adapter supplies a loading view, not a persisted native summary.
Consequently, the normal rule "unchanged content can refer to its previous summary path" is initially unsafe: the native paths in that view have never been uploaded.
Always forcing full output would avoid those invalid handles, but would fail the requirement that later summaries be incremental.
The solution must establish a real accepted baseline and then switch all summary participants to that same baseline.

### Separate full output from tracking and GC execution

`ContainerRuntime.getEffectiveFullTree()` combines an explicit full-tree request, the unconditional `forceFullTree` option, and the temporary `fullTreeUntilFirstAck` policy.
The effective value reaches native descendants, GC serialization, and the application callback.
It controls the **representation written to storage**, not whether the attempt should be tracked for later acceptance.

`GCSummaryStateTracker.summarize()` therefore receives both `trackState` and `fullTree`.
A tracked full attempt captures the GC state, tombstones, and deleted-node list even though it emits blobs rather than previous-summary handles.
Without that capture, the first full summary could be accepted without giving GC a baseline for the next incremental summary.
Untracked generation emits complete GC data and cannot overwrite a submitted proposal's pending state.

`fullTree` is also different from `fullGC`.
The former disables summary-handle reuse; the latter requests regeneration of the reachability graph during GC execution.
Writing the full stored GC representation does not by itself rerun reachability discovery, change sweep policy, or inline attachment payloads.

### Keep generation, submission, and acceptance separate

The GC tracker previously had a single pending generated value.
That is not enough when an earlier proposal can be acknowledged after a retry or another generation.
Consider proposal A containing GC state G1, followed by an attempt B containing G2.
If A's ACK adopted the most recently generated G2, a later "unchanged G2" handle would resolve against A's stored G1.
The comparison baseline and the handle's storage parent would disagree.

The implementation uses three distinct states:

| State               | Owner and transition                                                                                    | Why it is separate                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Current generation  | `GCSummaryStateTracker.wipSummaryData` captures the tracked attempt.                                    | A failed or abandoned generation must not replace an already submitted proposal.  |
| Submitted proposals | `completeSummary(proposalHandle, referenceSequenceNumber)` moves captured data into `pendingSummaries`. | The proposal handle identifies exactly which captured state an ACK accepts.       |
| Accepted baseline   | `refreshLatestSummary(result, proposalHandle)` adopts only the matching tracked proposal.               | Incremental comparisons and `/gc` handles must describe the same accepted parent. |

`ContainerRuntime` calls the GC completion and cleanup hooks alongside the native summarizer-node hooks.
The `finally` cleanup drops only work in progress, leaving submitted proposals available for delayed ACKs.
Proposal handles, rather than sequence numbers alone, distinguish retries at the same checkpoint.
Retirement removes older-checkpoint proposals consistently with native tracking; it does not discard another proposal merely because its checkpoint is equal.

### Adopt one proposal across all participants

`ContainerRuntime.refreshLatestSummaryAck()` serializes acceptance work and blocks a new generation while acceptance is in progress.
For a locally tracked proposal, the order is:

1. Refresh the native summarizer nodes.
2. Verify that the captured application generation matches the acknowledged proposal and checkpoint.
3. Refresh that proposal's GC state.
4. Record the accepted storage parent: proposal handle, ACK handle, and reference sequence number.
5. Invoke that proposal's synchronous application `onAccepted` callback.
6. End temporary full-tree forcing if the accepted generation was full.

A remote/untracked ACK does not manufacture a local baseline.
The existing fetch-latest/close handling remains applicable to a newer remote summary.
Duplicate ACKs do not invoke an already-promoted application callback again.
If native, GC, or application adoption fails, the runtime closes rather than attempting incremental reuse from inconsistent state.
This is fail-closed coordination, **not transactional rollback** of already adopted native state.

### Correlate GC recovery with the accepted checkpoint

GC auto-recovery separately requests a full reachability run and waits for a summary containing that recovery to be accepted.
A later recovery request must not be cleared by the delayed ACK of an earlier summary.
Each request increments a local recovery generation; a completed run exposes that generation to summary capture.
Only acceptance of a proposal carrying the current completed generation clears the request.

`IGCSummaryTrackingData.recoveryGeneration` is in-memory bookkeeping, not a new stored GC field.
The existing GC blob layout and handle paths remain unchanged.
These changes coordinate persistence and recovery; they do not introduce a new GC reachability model.

### Source and regression map

| Implementation                                                                                                                                                                                                    | Responsibility                                                                                                      | Focused evidence                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`containerRuntime.ts`](../../../../packages/runtime/container-runtime/src/containerRuntime.ts): `ISummaryGenerationOptions`, `getEffectiveFullTree`, `addAdditionalRootTreeToSummary`, `refreshLatestSummaryAck` | Full-output policy, synchronous root participation, proposal-specific capture, and coordinated acceptance.          | [`containerRuntime.summaryGeneration.spec.ts`](../../../../packages/runtime/container-runtime/src/test/containerRuntime.summaryGeneration.spec.ts): retry/ACK ordering, delayed GC adoption, remote ACKs, full-tree propagation, callback failures, and handle preconditions. |
| [`gcSummaryStateTracker.ts`](../../../../packages/runtime/container-runtime/src/gc/gcSummaryStateTracker.ts): `summarize`, `completeSummary`, `clearSummary`, `refreshLatestSummary`                              | Track full attempts without emitting handles; separate current work from submitted proposals and accepted GC state. | [`gcSummaryStateTracker.spec.ts`](../../../../packages/runtime/container-runtime/src/test/gc/gcSummaryStateTracker.spec.ts): A's state is adopted after B and abandoned/untracked work, then B can be adopted independently.                                                  |
| [`garbageCollection.ts`](../../../../packages/runtime/container-runtime/src/gc/garbageCollection.ts): summary hooks and `autoRecovery`                                                                            | Forward full-output policy and proposal identity; clear only the recovery covered by the accepted proposal.         | [`garbageCollection.spec.ts`](../../../../packages/runtime/container-runtime/src/test/gc/garbageCollection.spec.ts): early and older recovery ACKs retain the request; a matching post-GC ACK clears it.                                                                      |
| [`gcDefinitions.ts`](../../../../packages/runtime/container-runtime/src/gc/gcDefinitions.ts): `IGarbageCollector`                                                                                                 | Define completion/cleanup hooks and proposal-aware refresh at the runtime/GC boundary.                              | The runtime and GC suites exercise the common lifecycle rather than a seed-only special path.                                                                                                                                                                                 |

The [reference scenarios](../../../../packages/test/local-server-tests/src/test/seedProjection/README.md#what-the-scenario-checks) separately verify real storage upload/ACK, native handle reuse, skipped HTML serialization, and unchanged persisted part IDs.
Runtime tests establish the contract; the sample application demonstrates one use of it.

## Incremental application projection

`additionalRootTree` adds an application-owned child beside `.channels`, with key validation, statistics, group
metadata, and explicit failure propagation. The key is currently application-selected; a uniform discovery convention
and optional application-authored `AGENTS.md` remain
[open design questions](../Application-Seed-Projection.md#projection-discovery-open-design).

The synchronous callback receives `ISummaryGenerationContext`: checkpoint, effective full-tree/tracking mode, and the
exact accepted parent. It returns `IAdditionalSummaryTree`, containing a tree and optional proposal-specific
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
