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
2. **Complex op representations:** Load across grouped, compressed, and chunked batches, including a large payload that genuinely uses the chunk-reassembly path. The current `SharedCounter` scenarios generate small operations.
3. **Attachment and blob state:** Create an attachment or blob-backed handle after the base snapshot, load to a target after its attach op, and verify the historical container can read the expected content.
4. **Cache and load isolation:** Run concurrent loads to different targets, then perform a normal live load with the same factory credentials. Verify each historical view remains pinned to its own target and no historical snapshot leaks through shared or persisted caches.
5. **Pre-canceled load:** Pass an already-aborted signal and verify the call rejects promptly without issuing storage work or leaving a partially loaded container. The existing cancellation test aborts only after replay has begun.
6. **Read-only enforcement:** Attempt a DDS mutation and call `connect()` on the returned historical container, then verify no op is submitted, no live connection is established, and the view does not advance. Existing coverage checks the exposed read-only and disconnected state without attempting either action.
7. **Mid-load lineage change:** Trigger a file restore after base-version discovery but before or during live-op replay and verify the shared `EpochTracker` rejects the mixed lineage. Existing epoch tests restore before the point-in-time load starts.
8. **Actual op-retention loss:** Target a range whose bridging ops were genuinely trimmed by the service. Existing deterministic failure coverage uses a target beyond the live tip as the available real-service approximation; it does not induce retention trimming.
9. **Version-history pagination:** Create enough file versions to cross the ODSP `/versions` page boundary and verify base selection still finds the closest recoverable version.
10. **Complete mark-to-load flow:** Obtain the target from `sealAndCaptureVersionMark()` and `resolve()` rather than reading `deltaManager.lastSequenceNumber`, then load and verify the marked state. The detailed marker scenarios are tracked in the runtime version-mark DEV document.

## Current limitations and future work

- ODSP is currently the only driver that implements the capability.
- Loading depends on both a recoverable snapshot at or before the target and retention of every bridging op.
- The returned container is intentionally frozen and does not support normal collaborative APIs.
- Real-service tests require ODSP credentials and cannot run against the local test server because it does not emulate driveItem version history or storage epochs.
