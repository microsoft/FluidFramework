# Point-in-Time Container Loading

Point-in-time loading materializes a disconnected, read-only container at an exact Fluid sequence number. The loader owns orchestration, while the driver owns finding a recoverable snapshot and supplying only the ops needed to reach the target.

This flow consumes a sequence number. It does not create or resolve version marks. The runtime version-mark design is documented in [`versionMarks/DEV.md`](../../../../runtime/container-runtime/src/versionMarks/DEV.md).

## Public flow

The host calls:

```ts
const historicalContainer = await loadContainerToSequenceNumber({
	request,
	loadToSequenceNumber,
	codeLoader,
	urlResolver,
	documentServiceFactory: getOdspPointInTimeDocumentServiceFactory(/* credentials */),
	logger,
	signal,
});
```

The result is a historical view with these invariants:

- `deltaManager.lastSequenceNumber` equals `loadToSequenceNumber`.
- The container is read-only, disconnected, and has inbound and outbound processing paused.
- It does not advance as new live ops sequence.
- It must not be connected or used as a normal collaborative container.

## End-to-end sequence

1. `loadContainerToSequenceNumber` validates that the target is a non-negative integer.
2. The loader structurally checks whether the supplied `IDocumentServiceFactory` implements `createPointInTimeDocumentService`.
3. `PointInTimeDocumentServiceFactory` adapts that capability to the normal `createDocumentService` call used by container loading, preserving the requested target sequence number.
4. The driver creates a point-in-time document service:
   - storage serves a recoverable snapshot whose sequence number is at or before the target;
   - delta storage serves the live document's retained ops, bounded so replay cannot pass the target;
   - the service is storage-only, preventing a live delta-stream connection.
5. `loadContainerPaused` loads the selected snapshot with automatic op processing disabled and forces the container into read-only mode.
6. If the snapshot is behind the target, the loader installs its op and cancellation listeners before connecting. It then replays ops until the target is processed.
7. At the target, the loader pauses both delta-manager queues, disconnects, removes its listeners, and returns the historical container.

If the chosen snapshot is already at the target, the loader pauses immediately. A snapshot newer than the target is rejected because replay cannot move backward.

## Delta replay batching and unpersisted ops

The load path has two independent batching concepts:

- A **runtime op batch** is an application submission unit. Grouping, compression, and chunking determine how that unit is represented and when its state can be applied atomically.
- A **delta-fetch page** is a transport range used by `requestOps` / `ParallelRequests`. ODSP defaults to pages of `hostPolicy.opsBatchSize` (5000) with `hostPolicy.concurrentOpsBatches` requests. The point-in-time wrapper converts even an unbounded caller request into the known exclusive boundary `target + 1`; `ParallelRequests` splits that bounded range into pages, buffers pages that complete out of order, and dispatches only the next contiguous sequence-number range. Partial snapshot/cache pages are continued from their first missing sequence number, oversized responses are split, and the final known range is retried until complete or failed.

For a normal connected ODSP load, each cache/storage miss also sends a `get_ops` request to PUSH. That path can supply ops that have sequenced but have not yet been flushed to durable delta storage. A point-in-time service is deliberately `storageOnly`, so it creates no delta-stream connection and its `requestFromSocket` callback has no active socket. It can therefore use bundled snapshot ops, flushed persisted-cache entries, and durable delta storage, but not PUSH-only ops.

This creates a materializability gap: a version mark can resolve from a live client's inbound map immediately after sequencing while a new point-in-time load still cannot fetch the target op from storage. `getSingleOpBatch` polls a known missing range and eventually fails after the storage retry window if the op is not persisted. Resolution of a marker and durable availability for historical loading are separate states.

## Driver capability contract

The loader intentionally does not know how a service stores historical snapshots. A capable driver must implement:

```ts
createPointInTimeDocumentService(
	resolvedUrl: IResolvedUrl,
	targetSequenceNumber: number,
	logger?: ITelemetryBaseLogger,
	clientIsSummarizer?: boolean,
): Promise<IDocumentService>;
```

That service must satisfy the following:

- `connectToStorage()` returns a snapshot at or before the target.
- `connectToDeltaStorage()` can replay every retained op after that snapshot through the target.
- Delta reads use `[from, to)` semantics; the target op is included by bounding `to` at `targetSequenceNumber + 1`.
- The service cannot become a writable live client.
- Missing bases, unavailable bridging ops, and lineage mismatches fail explicitly rather than returning an incorrect state.

The loader detects this capability structurally so callers pass the driver's factory directly. The adapter is internal and cannot create new containers.

## Package ownership and planned extraction

The current placement in `@fluidframework/container-loader` was explicitly described as
prototype-only in the [original review discussion](https://github.com/microsoft/FluidFramework/pull/27703#discussion_r3623422928).
The follow-up package extraction is not otherwise captured in the current implementation docs.

The architectural concern is slightly narrower than "the loader is ODSP-specific":

- `loadContainerToSequenceNumber` does not import ODSP code. It is structurally driver-agnostic and
  can work with any `IDocumentServiceFactory` that implements
  `createPointInTimeDocumentService`.
- ODSP is currently the only driver that implements that capability. In particular, the current
  recoverable-base selection relies on ODSP file-version history and epoch validation.
- Exposing this optional, currently ODSP-only workflow from the core container-loader package makes
  the loader own a feature-level API even though its reusable responsibility is only loading and
  pausing a container.

The proposed boundary is a dedicated point-in-time feature package (working name
`@fluidframework/point-in-time`; final naming is a package/API review decision). The package should
own the host-facing orchestration while depending on the generic loader primitive and accepting a
capable driver factory.

### Move to the feature package

| Current location | Responsibility after extraction |
| --- | --- |
| `container-loader/src/loadContainerToSequenceNumber.ts` | Public `loadContainerToSequenceNumber` entry point, target validation, and `ILoadContainerToSequenceNumberProps`. |
| `container-loader/src/pointInTimeServices.ts` | Point-in-time factory capability contract, structural capability check, and adapter to `IDocumentServiceFactory`. |
| `container-loader/src/test/loadContainerToSequenceNumber.spec.ts` | Feature-entry-point validation and capability-boundary tests. |
| `container-loader/src/test/pointInTimeServices.spec.ts` | Capability detection and adapter tests. |
| This `pointInTime/DEV.md` | Cross-package feature flow, package boundary, host contract, and end-to-end test map. |

The move also requires removing the two host-facing exports from the container-loader entry point
and generated API surface, adding them to the new package's alpha entry point, and updating
consumers and point-in-time end-to-end tests to import from the new package. API report files must
be regenerated rather than edited by hand.

### Keep in existing packages

| Current owner | What remains | Why |
| --- | --- | --- |
| `@fluidframework/container-loader` | `loadContainerPaused` and its general loading machinery | This is the driver-agnostic loader primitive. It predates point-in-time loading and is also used by non-ODSP callers. The feature package should compose it rather than duplicate loader internals. |
| `@fluidframework/odsp-driver` | `pointInTimeDriver/`, `odspVersionManager/`, and `getOdspPointInTimeDocumentServiceFactory` | These components depend on ODSP file-version APIs, resolved URLs, caches, storage policies, and epoch tracking. Moving them would either leak ODSP internals into the feature package or duplicate driver construction logic. |
| `@fluidframework/container-runtime` | `versionMarks/` resolver implementation and runtime hooks | Capture and locator resolution are driver-agnostic but tightly coupled to outbound batching, pending state, inbound processing, and the runtime lifecycle. They produce the sequence number consumed by the feature package; they do not perform historical loading. |

The new package should not import ODSP directly. Its contract remains capability-based so another
driver can implement point-in-time loading later. ODSP remains the only supported provider until
another driver can supply a recoverable snapshot at or before the target, all bridging ops, and an
equivalent lineage-safety guarantee.

### Extraction dependency direction

The intended dependency flow is:

```text
container-runtime version mark resolver
              |
              v
       resolved sequence number
              |
              v
@fluidframework/point-in-time
  |                         |
  v                         v
container-loader       capable driver factory
loadContainerPaused    (currently ODSP only)
```

This preserves the existing two-step contract: the runtime resolves an app-owned locator to a
sequence number, and the feature package materializes that sequence number. The feature package
must not make container-loader depend on ODSP or merge mark resolution into container loading.

## ODSP implementation

ODSP resolves the closest recoverable driveItem version at or before the target. It then composes:

- storage from that file version;
- bounded delta storage from the live document;
- a shared `EpochTracker` across version discovery, snapshot reads, and live-op reads.

The shared epoch prevents replay across a disruptive file restore or other lineage change. A fresh non-persistent cache also prevents a historical snapshot from contaminating normal live-load caches.

Detailed ODSP version selection, lineage validation, and bounded replay are documented in [`odspVersionManager/DEV.md`](../../../../drivers/odsp-driver/src/odspVersionManager/DEV.md).

## Failure and cancellation behavior

- A malformed target is rejected before URL resolution, capability inspection, or network work.
- A factory without the point-in-time capability produces a `UsageError`.
- No file version at or before the target produces a `UsageError` from the driver.
- A newer-than-target snapshot is rejected by `loadContainerPaused`.
- Missing or trimmed bridging ops fail the load rather than returning a container short of the target.
- An ODSP epoch mismatch fails non-retryably rather than combining a historical snapshot with ops from a different file lineage.
- An `AbortSignal` cancels replay, closes the partially loaded container, and rejects the load.

Like normal storage catch-up, retriable network failures may retry for an extended period. Callers that need bounded waiting should supply an `AbortSignal`.

## Implementation map

| File | Responsibility |
| --- | --- |
| `loadContainerToSequenceNumber.ts` | Validates the target and driver capability, installs the adapter, and starts the paused load. |
| `pointInTimeServices.ts` | Defines the structural driver capability and adapts it to `IDocumentServiceFactory`. |
| `loadPaused.ts` | Loads read-only, replays to the exact target, pauses processing, disconnects, and handles cancellation. |
| `packages/drivers/odsp-driver/src/pointInTimeDriver/odspPointInTimeDocumentServiceFactory.ts` | Selects the ODSP base version and creates the historical service with shared epoch tracking. |
| `packages/drivers/odsp-driver/src/pointInTimeDriver/odspPointInTimeDocumentService.ts` | Recombines historical storage with bounded live delta storage and enforces storage-only behavior. |

## Test map

Loader unit coverage:

- `src/test/loadContainerToSequenceNumber.spec.ts` covers target validation order and the capability error boundary.
- `src/test/pointInTimeServices.spec.ts` covers structural capability detection, target forwarding, argument forwarding, and rejecting container creation through the adapter.

ODSP unit coverage exercises base selection, no-base failures, version URL resolution, bounded delta reads, storage routing, storage-only behavior, and shared epoch/cache construction.

Real-service ODSP coverage lives under [`packages/test/test-end-to-end-tests/src/test/pointInTime/`](../../../../test/test-end-to-end-tests/src/test/pointInTime/):

- `loadToSequenceNumber.spec.ts` covers exact version boundaries, replay to a mid-stream target, and distinct historical targets.
- `loadSuccess.spec.ts` covers the earliest recoverable state, deterministic repeated loads, a frozen read-only result, and deep-history replay.
- `epochMismatch.spec.ts` and `loadFailure.spec.ts` cover lineage changes, unavailable ops, malformed targets, and cancellation during replay.
- `odspVersionApi.spec.ts` verifies the real-service version-history test setup.
- `pointInTimeTestUtils.ts` supplies the shared counter runtime, summarizer, version-snapshot helpers, and point-in-time load wrapper.

These suites validate loading after a target sequence number is already known. End-to-end creation and resolution of a version mark before loading is tracked as future work in the runtime version-mark DEV document.

## Missing end-to-end coverage

The following loading behaviors are covered by unit or integration tests, inferred through a nearby scenario, or not covered at all, but do not yet have direct real-service end-to-end coverage:

1. **Boundary targets:** Load sequence number `0` and the current live tip. Existing successful tests use a non-zero recoverable point and advance the document past the target before loading.
2. **Complex runtime op representations:** Load across grouped, compressed, and chunked batches, including a large payload that genuinely uses the chunk-reassembly path. The current `SharedCounter` scenarios generate small operations. This is separate from delta-fetch page batching below.
3. **Attachment and blob state:** Create an attachment or blob-backed handle after the base snapshot, load to a target after its attach op, and verify the historical container can read the expected content.
4. **Cache and load isolation:** Run concurrent loads to different targets, then perform a normal live load with the same factory credentials. Verify each historical view remains pinned to its own target and no historical snapshot leaks through shared or persisted caches.
5. **Cancellation entry and propagation:** Pass an already-aborted signal and verify no storage work begins. During replay, propagate cancellation through the delta-storage fetch rather than only rejecting the loader's wait promise, and verify retries and network reads stop promptly. The existing cancellation test aborts only after replay has begun and observes that storage retries can continue racing teardown.
6. **Read-only enforcement:** Attempt a DDS mutation and call `connect()` on the returned historical container, then verify no op is submitted, no live connection is established, and the view does not advance. Existing coverage checks the exposed read-only and disconnected state without attempting either action.
7. **Mid-load lineage change:** Trigger a file restore after base-version discovery but before or during live-op replay and verify the shared `EpochTracker` rejects the mixed lineage. Existing epoch tests restore before the point-in-time load starts.
8. **Actual op-retention loss:** Target a range whose bridging ops were genuinely trimmed by the service. Existing deterministic failure coverage uses a target beyond the live tip as the available real-service approximation; it does not induce retention trimming.
9. **Version-history pagination:** Create enough file versions to cross the ODSP `/versions` page boundary and verify base selection still finds the closest recoverable version.
10. **Complete mark-to-load flow:** Obtain the target from `sealAndCaptureVersionMark()` and `resolve()` rather than reading `deltaManager.lastSequenceNumber`, then load and verify the marked state. The detailed marker scenarios are tracked in the runtime version-mark DEV document.
11. **Targets inside atomic batches:** Exercise targets on the first, middle, and last sequence number of ordinary multi-op, grouped, compressed, and chunked batches. Runtime batch processing can advance `lastSequenceNumber` to the batch end atomically, so define whether a non-boundary target is rejected or normalized to the batch end; never return a container whose sequence number silently overshot the requested target. Version marks intentionally resolve to a batch's last op and should remain a safe input.
12. **Protocol and system-op targets:** Load to sequence numbers occupied by attach, summarize/summary-ack, join/leave, and other non-runtime messages. Verify the loader still stops exactly at the requested global sequence number even when the application state does not change at that op.
13. **Cleanup and error preservation:** Abort, close, or fail delta replay while completion is racing. Verify listeners are removed, the partial container is closed exactly once, and cleanup does not replace the original cancellation or op-availability error. Today `disconnect()` after the container has already closed can surface `"The Container is closed and cannot be disconnected"` and mask the real failure.
14. **Numeric limits:** Reject non-safe sequence numbers, not only negative and fractional values. Driver implementations commonly compute `target + 1` for an exclusive upper bound, so `Number.MAX_SAFE_INTEGER` and nearby values need an explicit contract that cannot lose precision.
15. **Nested routes and historical code:** Load requests with a data-store path and code hint, and load a target whose document state requires objects or schema introduced at a different code proposal. Verify request routing and code loading remain deterministic for the historical view.
16. **Resource cleanup on construction failure:** Fail URL resolution, base selection, storage connection, code loading, and delta-storage connection after progressively more resources have been created. Verify every partially created service/container is disposed without masking the initiating error.
17. **Sequenced but not yet persisted ops:** Start the historical load immediately after a live client observes the target sequence number, before the ordering service has flushed it to ODSP delta storage. Cover eventual persistence, persistence beyond the current 30-second missing-op window, caller cancellation while waiting, and a permanently unavailable target. Define whether the public API waits, returns a retryable availability result, or requires the host to coordinate an explicit flush.
18. **Parallel fetch page boundaries:** Vary `opsBatchSize` and `concurrentOpsBatches`; place the target at the start, middle, and exclusive end of a page; and complete requests out of order. Cover partial and oversized responses, a final short page, and cancellation with buffered later pages. Verify an unbounded DeltaManager request is converted to the known `target + 1` boundary, only contiguous ops through the target are dispatched, and no request crosses that boundary.
19. **Snapshot/cache/storage source transitions:** Materialize a target whose bridge begins in bundled snapshot ops, crosses one or more persisted ops-cache batches, and finishes in storage. Cover a partial dirty `OpsCache` batch that has not yet been flushed, a timer/dispose flush racing the read, a cache gap that permanently disables further cache reads, and duplicate boundary ops arriving from multiple sources.
20. **Parallel failure isolation and backpressure:** Let later pages complete and buffer while an earlier page retries or fails. Verify no buffered page is delivered across the gap, the first terminal error reaches the stream exactly once, late request completions cannot change the outcome, and cancellation releases buffered results. Measure memory for deep-history loads with a slow consumer and multiple large pages so `results` and the output `Queue` cannot grow without an explicit bound.
21. **Batching configuration limits:** Exercise zero, negative, fractional, and excessively large `opsBatchSize` / `concurrentOpsBatches` values. Define validation and safe upper bounds before `ParallelRequests.run()` assertions or excessive speculative work can turn host configuration into a container-closing failure or memory spike.

## Current limitations and future work

- ODSP is currently the only driver that implements the capability.
- Loading depends on both a recoverable snapshot at or before the target and retention of every bridging op.
- The returned container is intentionally frozen and does not support normal collaborative APIs.
- Real-service tests require ODSP credentials and cannot run against the local test server because it does not emulate driveItem version history or storage epochs.
- Targets newer than the live tip currently fail only after the delta stack's retry window. A future driver availability contract could distinguish a future/not-yet-sequenced target from a permanently unavailable range and fail or wait according to explicit caller policy.
- A sequence number observed on PUSH is not necessarily available from durable delta storage yet. The current storage-only historical service cannot use PUSH's `get_ops` path, so near-head loads may wait for persistence or fail even though a live client has already processed the target.
