# Container Loader Development Notes

This file documents loader implementation details for contributors working in `@fluidframework/container-loader`.
It is written as question and answer notes so a new reader can follow the loading flow from caller intent to loader plumbing.

## Historical load targets

### What problem is this flow trying to solve?

Some callers need to materialize a container as of a specific point in document history instead of always loading the latest reachable state.
For the current prototype, FF represents that point as a target sequence number plus an optional batch ID.

The short version is: a caller needs a way to say, "load this container to this historical point," and the loader needs to carry that request far enough down the stack that a storage driver can see it.

### What question does Phase 1 answer?

Phase 1 answers: "How does a caller tell the loader which point to materialize?"

It defines the target shape and adds caller-facing surfaces that can carry the target:

- `LoaderHeader.sequenceNumber`, which already exists on the loader request surface.
- `ILoadExistingContainerPropsAlpha.loadToSequenceNumber`.
- `ILoadExistingContainerPropsAlpha.loadToBatchId`.

### What question does Phase 2 answer?

Phase 2 answers: "Can the requested point reach the storage driver?"

It threads the target from request headers into `Container.load`, then into `SerializedStateManager.fetchSnapshot`, and finally into `ISnapshotFetchOptionsAlpha` for drivers that implement `IDocumentStorageService.getSnapshot`.

### What question does Phase 3 answer?

Phase 3 answers: "Given a base snapshot, can FF replay forward and pause at the right point?"

It uses `loadContainerPaused` to load a base snapshot without immediately processing trailing ops, then connects just long enough to replay ops until the requested target is reached.
If the caller supplied a batch ID, paused loading also requires that matching batch metadata to be observed before pausing at the target sequence number.

### What question does Phase 4 answer?

Phase 4 answers: "Can ODSP choose a useful historical base snapshot instead of always returning latest?"

When ODSP receives `ISnapshotFetchOptionsAlpha.loadToSequenceNumber`, it lists recent ODSP versions, reads candidate snapshot trees, inspects each candidate's document attributes for its snapshot sequence number, and returns the closest candidate that can be replayed to the requested target.

If the caller supplied `loadToBatchId`, ODSP chooses a snapshot strictly before `loadToSequenceNumber` so `loadContainerPaused` can replay the target op and observe the requested batch metadata.

### What question does Phase 5 answer?

Phase 5 answers: "Before trying to load, can FF tell the host whether this point is currently materializable?"

It adds point-in-time materialization probes through alpha extension interfaces: `IDocumentStorageServiceAlpha` for drivers and `ContainerAlpha` for hosts.
The current implementation distinguishes ODSP base-snapshot availability outcomes:

- `materializable`: ODSP found a usable base snapshot.
- `missingBaseVersion`: ODSP could list recent versions, but none can serve as the base snapshot for the target. (noUsableBaseSnapshot)
- `permissionOrAccessDenied`: ODSP could not access the document or version history.
- `unknownUnavailable`: ODSP could not determine availability for another reason.

The result type also reserves `missingOps` and `markerExpired` for later delta-storage retention and marker-retention probes. (opsUnavailable)

### What is the target shape?

The target is:

- `sequenceNumber`: the op sequence number the caller wants the loaded container to reach.
- `batchId`: an optional runtime batch identifier used when the caller needs batch-level validation at that sequence number.

The sequence number is the primary target.
The batch ID is optional because not every historical load needs to prove that a specific batch is present at the target point.

### Why use sequence number as the main target?

Fluid's ordered op stream already assigns every sequenced op a monotonically increasing `sequenceNumber`.
Snapshots, document attributes, delta storage ranges, and catch-up logic all use sequence numbers as the common coordinate system for document history.

That makes sequence number the natural target for historical loading: it says "materialize the document at this ordered point" without tying the API to one driver's snapshot identity or one service's storage format.
The storage driver can then decide whether to fetch a snapshot at that sequence number, fetch an older snapshot plus trailing ops, or fail if the requested point is outside the history it can serve.

### Why carry batch ID for the prototype?

The prototype has been using batch ID as an additional discriminator for the requested point.
Sequence number identifies the ordered position, while batch ID can identify the runtime batch the caller expected to land at that position.

That is useful because a historical load target can be ambiguous if the caller only says "load to sequence number N" but the validation scenario really means "load to sequence number N, and make sure N corresponds to this batch I care about."
Passing `batchId` lets later driver or service code reject a load when the requested sequence number is reachable but does not match the batch the prototype intended to validate.

In other words, `sequenceNumber` is the location and `batchId` is optional evidence that the location is the expected one.

The prototype uses both because they answer different questions:

- `sequenceNumber`: where to load to.
- `batchId`: optional evidence that this is the intended point.

For replay, the practical question is:

```text
Given a base snapshot at sequence S, can we replay ops S+1 through target T?
```

The target `sequenceNumber` supplies `T`.
The optional `batchId` lets the prototype prove that the replayed target op belongs to the runtime batch the caller intended, instead of merely proving that replay reached sequence `T`.

This is also why ODSP chooses snapshots differently when `batchId` is present.
If no batch ID is supplied, a base snapshot at or before `T` is usable.
If a batch ID is supplied, ODSP chooses a base snapshot strictly before `T`, because `loadContainerPaused` must replay the target op to observe its batch metadata.
If the snapshot is already exactly at `T`, the batch metadata is already folded into snapshot state and this prototype cannot validate it from replayed ops.

### Why is `batchId` optional?

Some scenarios only need a sequence-number target.
Other scenarios need to validate that the target sequence number corresponds to a specific runtime batch, usually to detect ambiguity or a mismatch between the caller's expected historical point and the document history visible to the service.

Keeping `batchId` optional lets the loader carry the stricter validation signal only when a caller has one.

### Does a target sequence number mean "load exactly this snapshot"?

No.
A sequence number describes the document point the caller wants to materialize.
The storage driver may satisfy that request by choosing a snapshot at or before that point and returning enough trailing ops for the loader/runtime to reach the requested state.

The exact strategy belongs to the storage driver and service implementation.
The loader's responsibility in these phases is to preserve the caller's target and make it visible at the storage boundary.

### Does this feature mean ODSP chooses a historical snapshot?

Yes, for the ODSP `getSnapshot` path when `loadToSequenceNumber` is supplied.
ODSP bypasses the normal latest snapshot cache/network path, lists recent versions, fetches candidate snapshot trees, and chooses a candidate by sequence number.

This is still a bounded implementation: ODSP only searches the recent version window it asks the service for, and batch ID validation still happens during loader replay, not from ODSP snapshot metadata.

## Caller-facing surface

### Which request headers carry the target?

The shared loader definitions in `packages/common/container-definitions/src/loader.ts` expose the sequence-number header on `LoaderHeader`:

```typescript
LoaderHeader.sequenceNumber // "fluid-sequence-number"
```

The batch ID header is intentionally not exposed on the shared beta `LoaderHeader` enum.
The alpha `ILoaderHeaderAlpha` interface extends the request header bag with the `"fluid-batch-id"` header when callers opt into the alpha load props.

### Why are these represented as loader headers?

`Loader.resolve` already takes an `IRequest`, and loader-specific options are historically carried through request headers.
Using `LoaderHeader` keeps the target compatible with callers that already construct loader requests directly.

### Which load props should callers use?

Callers using `loadExistingContainer` should prefer the alpha typed load props:

```typescript
const loadProps: ILoadExistingContainerPropsAlpha = {
	// Standard host and driver wiring omitted.
	request,
	loadToSequenceNumber: 123,
	loadToBatchId: "client_0_[42]",
};
await loadExistingContainer(loadProps);
```

These props are named separately from request headers so hosts can express the loading target without manually constructing loader header bags.

### Can callers still set the headers themselves?

Partially.
`Loader.resolve` reads `LoaderHeader.sequenceNumber` from `request.headers`, so a caller that works directly with `Loader.resolve` can set that shared header.
Batch ID is currently carried through the alpha helper props instead of a shared `LoaderHeader` enum value.

`loadExistingContainer` is the ergonomic helper path.
It accepts `loadToSequenceNumber` and `loadToBatchId`, converts them to loader headers, and then calls `Loader.resolve` with the rewritten request.

### What happens if both typed props and request headers are present?

`loadExistingContainer` clones the caller's request headers and overwrites the target headers when `loadToSequenceNumber` or `loadToBatchId` is defined.

That means the explicit typed props win over any existing target headers in the request passed to `loadExistingContainer`.
Other request headers are preserved.

### Why do the props use `loadToSequenceNumber` instead of just `sequenceNumber`?

The `loadTo` prefix makes the intent explicit at the caller surface.
It distinguishes the requested materialization point from other sequence numbers that appear throughout the loader, delta manager, runtime, and document attributes.

### Where are those props converted into headers?

`loadExistingContainer` in `src/createAndLoadContainerUtils.ts` clones the caller's request headers, adds `LoaderHeader.sequenceNumber` when `loadToSequenceNumber` is defined, adds the internal batch ID header when `loadToBatchId` is defined, and then passes the rewritten request to `Loader.resolve`.

That keeps the public helper ergonomic while preserving the existing loader contract that target information flows through request headers.

## Loader-to-container flow

### Where does `Loader.resolve` read the target?

`Loader.resolve` delegates to `resolveCore`, which resolves the request URL and normalizes the `LoaderHeader.version` value from the parsed URL.
After that, `loadContainer` reads the historical target from the request headers:

```typescript
loadToSequenceNumber: request.headers?.[LoaderHeader.sequenceNumber]
loadToBatchId: request.headers?.["fluid-batch-id"]
```

Those values become part of the `IContainerLoadProps` object passed to `Container.load`.

### Does `Loader.resolve` validate the target?

No.
At this phase, `Loader.resolve` only reads and forwards the values.
It does not validate whether the sequence number exists, whether the batch ID matches, or whether the driver can satisfy the target.

Validation belongs closer to the implementation that can inspect service history and batch metadata.

### Does `Loader.resolve` mutate the original request?

`resolveCore` ensures `request.headers` exists and may write the parsed `LoaderHeader.version` back into it.
The historical load target is read from headers and copied into `IContainerLoadProps`; it is not otherwise transformed there.

### What does `Container.load` receive?

`Container.load` receives an `IContainerLoadProps` object with the regular load inputs plus the historical target:

- `resolvedUrl`
- `version`
- `loadMode`
- `pendingLocalState`
- `loadToSequenceNumber`
- `loadToBatchId`

The target stays with the container load props until the container asks `SerializedStateManager` for its base snapshot.

### Why is the target carried on `IContainerLoadProps`?

`IContainerLoadProps` is the handoff from loader request processing into container boot.
Adding the target there avoids re-reading request headers in deeper container code and makes the dependency explicit: container loading has a requested historical target.

### Does `Container.load` materialize the target itself?

No.
`Container.load` coordinates document service creation, snapshot fetch, protocol/runtime initialization, saved-op replay, and delta manager setup.
It does not know how a specific storage service should choose a historical snapshot.

For this flow, `Container.load` only passes the target into `SerializedStateManager.fetchSnapshot`.

### What happens when `pendingLocalState` is provided?

When `pendingLocalState` is provided, `SerializedStateManager.fetchSnapshot` loads from that pending state instead of fetching a base snapshot from storage.
In that path, the historical target is not passed to storage because storage is not asked for the base snapshot.

This is intentional for the current implementation: pending local state already contains the base snapshot and saved ops needed to rehydrate that captured state.

### Does the target affect `loadMode`?

No.
The target is carried separately from `IContainerLoadMode`.
`loadMode` still controls behavior like how many ops are processed before returning and when the delta connection is established.

Later phases may need to reconcile requested historical materialization with op-fetching behavior, but the target itself is not encoded as a `loadMode` value.

## Replay and pause flow

### Which API proves loader-side replay to a target?

`loadContainerPaused` in `src/loadPaused.ts` is the current loader-side proof point.
It already supported loading a container, replaying ops forward, and pausing once `loadToSequenceNumber` was reached.

Phase 3 extends that behavior with optional batch ID matching.

### Why use `loadContainerPaused` for Phase 3?

`loadContainerPaused` owns the behavior this phase needs to prove: it returns a container that is loaded and then paused so callers can inspect materialized state without continuing to process new ops.

That makes it the narrowest place to prove that FF can start from a suitable base snapshot, replay forward, and stop at the requested historical point.

### How does `loadContainerPaused` avoid processing ops too early?

It calls `loadExistingContainer` with `LoaderHeader.loadMode` forced to `{ opsBeforeReturn: undefined, deltaConnection: "none" }`.
That loads the container without starting op processing before `loadContainerPaused` has installed its `op` and `closed` listeners.

After the listeners are installed, `loadContainerPaused` calls `container.connect()` so the delta manager can fetch and process ops.

### How does sequence-number-only pausing work?

When only `loadToSequenceNumber` is provided, the op handler watches `deltaManager.lastSequenceNumber`.
Once the last processed sequence number is greater than or equal to the requested sequence number, `loadContainerPaused` pauses the inbound and outbound queues and resolves with the container.

This proves the loader can replay from the base snapshot to the requested sequence point.

### How does batch-aware pausing work?

When `loadToBatchId` is provided, `loadContainerPaused` tracks whether an incoming processed op has `metadata.batchId` equal to the requested batch ID.

The container pauses only when both conditions are true:

- The requested `loadToSequenceNumber` has been reached.
- The requested `loadToBatchId` has been observed in processed op metadata.

### What happens if the sequence number is reached before the requested batch ID is observed?

`loadContainerPaused` fails the load instead of continuing past the requested sequence number.

This matters because Phase 3 is proving materialization at the requested point.
If the target sequence is reached without the expected batch metadata, continuing forward would no longer be "pause at this point"; it would be "search future history for this batch."

### What happens if the base snapshot is already newer than the target?

`loadContainerPaused` closes the container and throws.
A snapshot newer than the target cannot be replayed backward to the requested historical point.

### What happens if the base snapshot is already exactly at the target?

If no batch ID was requested, `loadContainerPaused` pauses immediately and returns the container.

If a batch ID was requested, the current implementation fails because there is no replayed op from which to observe batch metadata.
That is a prototype boundary: future storage-driver support may be able to validate batch identity from snapshot-associated metadata, but `loadContainerPaused` can only validate batch ID by observing replayed ops.

### Why does `loadContainerPaused` force readonly mode?

The returned container is an inspection/materialization container, not a normal editing container.
`loadContainerPaused` calls `container.forceReadonly?.(true)` so user changes are not submitted while the helper is replaying and then pausing op queues.

### Why does `loadContainerPaused` disconnect after replay?

After the requested point is reached and queues are paused, keeping the delta connection open has little value.
The container is not processing further ops and is not sending ops because it is readonly.
Disconnecting avoids holding unnecessary connection and collaboration-window resources.

### What does Phase 3 still not prove?

Phase 3 proves that FF can replay forward from a base snapshot and pause at the requested point when the relevant ops are available.
It does not prove that a driver can choose the correct historical base snapshot.

Phase 4 adds that proof for ODSP's recent-version `getSnapshot` path.

## ODSP historical base snapshot flow

### Where does ODSP receive the target?

ODSP receives the target in `packages/drivers/odsp-driver/src/odspDocumentStorageManager.ts` through `OdspDocumentStorageService.getSnapshot(snapshotFetchOptions)`.

When `snapshotFetchOptions.loadToSequenceNumber` is undefined, ODSP uses its existing latest snapshot flow, including cache and `trees/latest` behavior.
When `loadToSequenceNumber` is defined, ODSP uses the historical path.

### Why does ODSP skip the latest snapshot cache for historical loads?

The normal ODSP snapshot path is optimized for current-document loading.
It may return a cached latest snapshot or race cache and network latest snapshot requests.

A historical target needs a base snapshot at or before a requested sequence number.
Using the latest cache would risk returning a snapshot newer than the target, which cannot be replayed backward.

### How does ODSP list historical candidates?

ODSP calls `getVersions(null, historicalSnapshotVersionCount, scenarioName, FetchSource.noCache)`.
Using a count greater than one makes ODSP call the `/versions?top=N` endpoint instead of the `trees/latest` shortcut used for a single latest version.

The returned version IDs are opaque service IDs.
ODSP does not infer ordering or sequence numbers from those IDs.

### How does ODSP learn a candidate snapshot's sequence number?

For each version, ODSP calls `getSnapshotTree(version, scenarioName)`.
Then it reads the document attributes blob from the snapshot tree:

- `.protocol/blobs/attributes` for current snapshots.
- `.attributes` at the root for older snapshot shape compatibility.

The parsed document attributes contain the snapshot's `sequenceNumber`, which ODSP uses for target selection.

### Which snapshot does ODSP select without a batch ID?

When only `loadToSequenceNumber` is supplied, ODSP returns the first candidate whose snapshot sequence number is less than or equal to the target.

Because ODSP asks `/versions?top=N` for recent versions, the candidates are expected to be newest first.
The first candidate at or before the target is therefore the closest usable base snapshot in that recent-version window.

### Which snapshot does ODSP select with a batch ID?

When `loadToBatchId` is supplied, ODSP returns the first candidate whose snapshot sequence number is strictly less than the target.

This strict-before rule is important.
`loadContainerPaused` validates batch ID by observing replayed op metadata.
If ODSP returned a snapshot exactly at the target, the target op would already be included in the snapshot and replay would not expose the batch metadata needed for validation.

### What happens if ODSP cannot find a suitable candidate?

ODSP throws a non-retryable error instead of silently returning latest.
Returning latest would make the caller believe the requested historical point was honored even when ODSP could not find a base snapshot that can replay to it.

### Does ODSP validate that `loadToBatchId` matches the target batch?

Not in Phase 4.
ODSP uses `loadToBatchId` to choose a strictly older base snapshot, but the actual batch match is still validated by `loadContainerPaused` while replaying ops.

### Does ODSP fetch trailing ops in this phase?

No.
ODSP selects the base snapshot.
The loader/runtime replay flow is responsible for fetching and processing ops after that base snapshot until the requested target is reached.

### Does historical loading assume a complete forever op log?

No.
Fluid should not model a document as one snapshot plus every op from the beginning of time.
A Fluid document has compacted durable state in summaries/snapshots, ops after a summary that are needed for catch-up, and service-dependent retention policies for how long old versions and old ops remain available.

For point-in-time loading, the replay question is narrower:

```text
For a chosen base snapshot at sequence S, are ops S+1 through target T still available?
```

If that replay range is available, FF can materialize the target by replaying forward from the base snapshot.
If that replay range is missing, FF cannot reconstruct the exact target from that base snapshot even when an old ODSP version exists.

That is why loadability separates `missingBaseVersion` from `missingOps`.
`missingBaseVersion` means no usable snapshot or version exists at or before the target.
`missingOps` means a base snapshot exists, but the required replay range from that snapshot to the target is no longer retained or cannot be fetched.

## Availability flow

### Why add an availability probe instead of only failing during load?

Historical loading has failure modes that are useful for hosts to explain before attempting a full load.
A host may want to tell the user whether the requested point is currently available, unavailable due to access, or unavailable because the service no longer has enough history.

The loading path still remains authoritative.
The availability probe is an explanation and preflight hook, not a substitute for handling load failure.

### Which API does a host call?

Hosts can call `ContainerAlpha.canMaterializePointInTime` by casting the loaded container with `asLegacyAlpha`:

```typescript
const availability = await asLegacyAlpha(container).canMaterializePointInTime({
	sequenceNumber: 123,
	batchId: "client_0_[42]",
});
```

`ContainerAlpha` is the `@legacy @alpha` host-facing extension of `IContainer` for this probe.
The container-loader implementation delegates the call to storage and returns `unknownUnavailable` when the driver does not support the storage probe.

### Which driver API does the container use?

The container delegates to `IDocumentStorageServiceAlpha.canMaterializePointInTime` through `ContainerStorageAdapter`.
The retry and protocol-tree storage wrappers forward the optional method so the underlying driver can answer even when normal loader storage wrappers are active.

### What does the target look like for availability checks?

The availability target is `IPointInTimeMaterializationTarget`:

```typescript
interface IPointInTimeMaterializationTarget {
	sequenceNumber: number;
	batchId?: string;
	scenarioName?: string;
}
```

This deliberately uses point-in-time language instead of loader-specific `loadTo` names because the probe is asking whether a point can be materialized, not performing the load.

### What does `materializable` mean today?

For ODSP today, `materializable` means ODSP found a usable base snapshot in the recent-version window.
If `batchId` is omitted, the base snapshot is at or before the target sequence number.
If `batchId` is supplied, the base snapshot is strictly before the target sequence number so replay can observe the batch metadata.

It does not yet prove that every trailing op required to replay from the base snapshot to the target is still available.
Until a delta-storage retention probe is added, this status should be read as "ODSP found a usable base snapshot," not "the full base-to-target replay range is guaranteed forever."

### Why does the result type include `missingOps` now?

The API needs a stable vocabulary for the failure modes hosts eventually need to explain.
Phase 5 reserves `missingOps` for the later delta-storage retention probe: the case where a base snapshot exists, but required trailing ops are missing.
This is distinct from `missingBaseVersion`, where no suitable base snapshot or version exists in the first place.

### Why does the result type include `markerExpired` now?

The prototype may eventually depend on service-side historical markers or batch markers that have their own retention policy.
`markerExpired` is reserved for the case where the target marker can no longer be used because retention expired, even if other document history is still available.

### How does ODSP answer the availability probe?

ODSP reuses the same recent-version candidate search used by historical `getSnapshot`.
It lists recent versions, reads candidate snapshot trees, reads each candidate's document attributes, and selects a base snapshot using the same at-or-before or strict-before rule.

The difference is that `getSnapshot` throws when no candidate exists, while `canMaterializePointInTime` returns `missingBaseVersion`.

### How does ODSP classify access failures?

If listing versions or reading candidate snapshots fails with `authorizationError` or `fileNotFoundOrAccessDeniedError`, ODSP returns `permissionOrAccessDenied`.
Other failures return `unknownUnavailable` because ODSP cannot safely distinguish them as base-snapshot absence, access denial, or transient service failure.

### Why keep Phase 5 out of the first loading PR?

Phase 5 is useful but separable from the core load path.
The first loading PR can be reviewed around target threading, ODSP base snapshot selection, and replay-to-target semantics.

Availability introduces a new host-facing decision API and a vocabulary for failure explanation.
That may be easier to review in a follow-up unless reviewers specifically want availability paired with loading.

## Snapshot fetch flow

### How does the target reach `SerializedStateManager`?

`Container.load` calls `this.serializedStateManager.fetchSnapshot(...)` with:

- the requested snapshot version, if any
- pending local state, if any
- `loadToSequenceNumber`
- `loadToBatchId`

`SerializedStateManager.fetchSnapshot` receives the target as optional parameters.

### What does `SerializedStateManager.fetchSnapshot` do with the target?

If `pendingLocalState` is undefined, `fetchSnapshot` calls the internal `getSnapshot` helper and passes the target along.

If `pendingLocalState` is defined, it builds the snapshot from pending state and does not call storage for the base snapshot.

### What is the internal `getSnapshot` helper responsible for?

The helper chooses between two storage shapes:

- `fetchISnapshot`, used when `supportGetSnapshotApi()` is true.
- `fetchISnapshotTree`, used when only the older snapshot-tree path is available.

The historical target can only be carried through the `fetchISnapshot` path because that path calls `IDocumentStorageService.getSnapshot` with an `ISnapshotFetchOptionsAlpha` object.

### How does the target reach storage drivers?

`fetchISnapshot` passes the target into `IDocumentStorageService.getSnapshot`:

```typescript
const snapshotFetchOptions: ISnapshotFetchOptionsAlpha = {
	versionId: specifiedVersion,
	loadToSequenceNumber,
	loadToBatchId,
};
storageAdapter.getSnapshot?.(snapshotFetchOptions);
```

The target reaches drivers as alpha fields on `ISnapshotFetchOptionsAlpha`.

### Which driver-facing type carries the target?

`ISnapshotFetchOptionsAlpha` in `packages/common/driver-definitions/src/storage.ts` carries the target:

```typescript
interface ISnapshotFetchOptionsAlpha extends ISnapshotFetchOptions {
	loadToSequenceNumber?: number;
	loadToBatchId?: string;
}

interface ISnapshotFetchOptions {
	versionId?: string;
	// Other existing snapshot fetch options omitted.
}
```

Drivers see the requested point through the alpha extension of the same options object that already carries `versionId`, `scenarioName`, cache behavior, loading groups, and fetch source.

### Does the target reach drivers that only implement `getSnapshotTree`?

No.
`getSnapshotTree` has the older `(version, scenarioName)` shape and cannot carry the `ISnapshotFetchOptionsAlpha` object.
The historical load target reaches storage drivers through `getSnapshot`, so driver support for that path is required before a driver can consume the target directly.

### Does the target affect snapshot refreshes?

Not currently.
Snapshot refresh logic uses `getLatestSnapshotInfo` to fetch the latest non-cached snapshot for offline pending-state support.
That path calls the shared snapshot helper without a historical target.

This is intentional: the historical target describes the initial load request, while snapshot refresh is about maintaining a useful current snapshot for later pending-state serialization.

### Does the target affect loading group snapshots?

Not directly.
Loading group snapshot fetches also use the base `ISnapshotFetchOptions` object shape, but the historical alpha fields described here are about the initial container boot snapshot.
If a future scenario requires historical loading of group snapshots, it should define how `loadToSequenceNumber`, `loadToBatchId`, and `loadingGroupIds` interact.

## Guarantees and boundaries

### What does this implementation guarantee?

This implementation guarantees that FF has a clear way to carry the caller's requested historical load target through the alpha loader surface and down to alpha snapshot fetch options.
The sequence target can be expressed through the existing `LoaderHeader.sequenceNumber`; the batch target is exposed through alpha `loadExistingContainer` props and carried internally as a loader request header.

For ODSP `getSnapshot`, this implementation also guarantees that a supplied `loadToSequenceNumber` triggers historical base snapshot selection from recent ODSP versions instead of the normal latest snapshot path.

For ODSP `canMaterializePointInTime`, this implementation guarantees that the same recent-version base snapshot search can be run before load and reported as a structured availability result.

### What does this implementation not guarantee yet?

This implementation does not guarantee that every driver or service can satisfy the target.
Driver support is implementation-specific.

The current code also does not guarantee that the returned container's state equals `loadToSequenceNumber` immediately after snapshot fetch.
ODSP returns a suitable base snapshot, and loader replay must still process trailing ops to materialize the target point.

The current availability probe does not guarantee trailing op availability or marker retention.
Those are represented in the result type but require later delta-storage and service-marker probes.

### What should a driver do when it sees `loadToSequenceNumber`?

A driver that supports historical loading should interpret `loadToSequenceNumber` as the requested materialization point.
The driver or service should choose a snapshot and any additional data needed for the loader/runtime to reach that point.

The precise behavior is driver-specific and must be documented in the driver implementation.

### What should a driver do when it sees `loadToBatchId`?

If batch validation is in scope, the driver or service should treat `loadToBatchId` as an expected batch identity at the requested sequence number.
If the requested sequence number does not correspond to that batch, the load should fail with a clear error.

If a driver does not support batch validation yet, it should not silently claim that validation occurred.

### What should happen if the target cannot be satisfied?

Later driver/service work should define the exact error behavior.
In general, failing clearly is better than returning an arbitrary latest snapshot and making the caller believe the requested historical point was honored.

Useful failure cases include:

- The requested sequence number is older than available history.
- The requested sequence number is newer than the service can materialize.
- The requested `batchId` does not match the batch at the requested sequence number.
- The driver only supports latest snapshot fetches and cannot interpret the target.

### Why not force validation in the loader?

The loader does not have enough information to validate the service's historical data.
It can inspect request headers and pass values down, but it cannot know which historical snapshots exist or whether a batch ID matches service history.

That knowledge belongs in the driver/service layer that fetches snapshots and ops.

### Why not encode the target in the URL?

The target is load behavior, not container identity.
Keeping it in loader headers and load props avoids changing URL formats and keeps the signal alongside other loader options.

### Is this API surface customer-facing?

Yes.
The historical load props, paused-load helper, point-in-time availability probe, and driver fetch options are legacy alpha API surface.
Changes to these surfaces require changeset coverage and API report regeneration when dependencies are installed.

## Code map

### Which files define the caller-facing target?

- `packages/common/container-definitions/src/loader.ts` defines the existing `LoaderHeader.sequenceNumber` request header.
- `packages/common/container-definitions/src/loader.ts` defines alpha `ILoaderHeaderAlpha` with the `"fluid-batch-id"` request header.
- `packages/loader/container-loader/src/createAndLoadContainerUtils.ts` defines alpha `ILoadExistingContainerPropsAlpha.loadToSequenceNumber` and `ILoadExistingContainerPropsAlpha.loadToBatchId`.

### Which files thread the target through loading?

- `packages/loader/container-loader/src/loader.ts` reads the target from request headers.
- `packages/loader/container-loader/src/container.ts` carries the target on `IContainerLoadProps` and forwards it into snapshot fetch.
- `packages/loader/container-loader/src/serializedStateManager.ts` passes the target into `getSnapshot` options.
- `packages/loader/container-loader/src/loadPaused.ts` replays ops forward and pauses once the requested sequence number, and optional batch ID, are satisfied.

### Which file exposes the target to drivers?

`packages/common/driver-definitions/src/storage.ts` exposes alpha `ISnapshotFetchOptionsAlpha.loadToSequenceNumber` and `ISnapshotFetchOptionsAlpha.loadToBatchId`.

### Which file implements ODSP historical snapshot selection?

`packages/drivers/odsp-driver/src/odspDocumentStorageManager.ts` implements ODSP historical base snapshot selection in `OdspDocumentStorageService.getSnapshot`.

When `loadToSequenceNumber` is supplied, it calls the ODSP historical path instead of the latest snapshot path.

### Which files implement point-in-time availability checks?

- `packages/common/driver-definitions/src/storage.ts` defines alpha `IPointInTimeMaterializationTarget`, `PointInTimeMaterializationAvailability`, and `IDocumentStorageServiceAlpha.canMaterializePointInTime`.
- `packages/loader/container-loader/src/container.ts` exposes `ContainerAlpha.canMaterializePointInTime` and `asLegacyAlpha`.
- `packages/loader/container-loader/src/container.ts` delegates the container method to storage.
- `packages/loader/container-loader/src/containerStorageAdapter.ts`, `retriableDocumentStorageService.ts`, and `protocolTreeDocumentStorageService.ts` forward the optional storage method.
- `packages/drivers/odsp-driver/src/odspDocumentStorageManager.ts` implements the ODSP base-version availability check.

### What is the end-to-end shape of the call flow?

The current flow is:

1. Caller passes `loadToSequenceNumber` and optionally `loadToBatchId` through alpha `ILoadExistingContainerPropsAlpha`, or sets the existing `LoaderHeader.sequenceNumber` value directly.
2. `loadExistingContainer` writes those values into request headers.
3. `Loader.resolve` resolves the URL and reads the target headers.
4. `Loader.loadContainer` passes the target into `Container.load` as load props.
5. `Container.load` passes the target into `SerializedStateManager.fetchSnapshot`.
6. `SerializedStateManager.fetchSnapshot` passes the target into the internal snapshot helper when loading from storage.
7. `fetchISnapshot` includes the target in `ISnapshotFetchOptionsAlpha` for `IDocumentStorageService.getSnapshot`.
8. ODSP `getSnapshot` lists recent versions and returns a base snapshot at or before the requested target, or strictly before it when batch ID validation needs replay.
9. `loadContainerPaused` can replay ops from the base snapshot and pause once the requested target is reached.

The availability flow is shorter:

1. Host calls `asLegacyAlpha(container).canMaterializePointInTime` with a sequence number and optional batch ID.
2. The container delegates through its storage adapter.
3. ODSP lists recent versions and searches for the same base snapshot it would use for historical load.
4. ODSP returns a structured availability status instead of loading the snapshot into a container.

### Where should I add more ODSP-specific behavior later?

ODSP-specific behavior should live in the ODSP driver/storage implementation that receives `ISnapshotFetchOptionsAlpha`.
That is where the code can decide how to translate `loadToSequenceNumber` and `loadToBatchId` into ODSP snapshot or ops requests.

This package should remain focused on loader/container plumbing unless the loader needs additional generic behavior.

## Testing guidance

### What should tests cover at this phase?

Tests should focus on request-shape and option-shape plumbing:

- `loadExistingContainer` forwards `loadToSequenceNumber` into `LoaderHeader.sequenceNumber`.
- `loadExistingContainer` forwards `loadToBatchId` into the internal batch ID request header.
- Existing request headers are preserved while target headers are added or overwritten by typed props.
- `SerializedStateManager.fetchSnapshot` passes `loadToSequenceNumber` and `loadToBatchId` into `ISnapshotFetchOptionsAlpha` when `getSnapshot` is used.
- `loadContainerPaused` pauses when the requested sequence number is reached.
- `loadContainerPaused` pauses at the requested sequence number only after the requested batch ID has been observed.
- `loadContainerPaused` fails if the requested batch ID has not been observed by the target sequence number.
- ODSP `getSnapshot({ loadToSequenceNumber })` selects the closest recent snapshot at or before the target.
- ODSP `getSnapshot({ loadToSequenceNumber, loadToBatchId })` selects a recent snapshot strictly before the target.
- ODSP `canMaterializePointInTime` reports `materializable` when a usable base snapshot exists.
- ODSP `canMaterializePointInTime` reports `missingBaseVersion` when recent versions contain no usable base snapshot.
- ODSP `canMaterializePointInTime` reports `permissionOrAccessDenied` for access-related ODSP failures.

### What should tests avoid claiming at this phase?

Tests should not claim that every driver actually materializes the requested historical point unless that driver implementation exists.

For ODSP, tests can claim historical base snapshot selection, but they should still avoid claiming full final container materialization unless the test includes replay to the requested target.

### What tests should be added as driver support expands?

As driver/service support expands, tests should cover:

- Successful historical materialization at a requested sequence number.
- Loading when the base snapshot is older than the requested sequence number and trailing ops are needed.
- Failure when the requested sequence number is unavailable.
- Failure when the requested batch ID does not match the requested sequence number.
- Behavior when `loadToBatchId` is omitted.
- Interaction with cache/no-cache snapshot fetch settings.
- Telemetry or error properties that help diagnose unsupported historical loads.

### What API artifacts need attention?

Because this work changes customer-facing and driver-facing TypeScript surfaces, API reports must be regenerated once dependencies are installed.
The changeset should include each meaningful package whose consumers see the new API surface.

### What should reviewers pay special attention to?

Reviewers should check:

- The target is not dropped between helper props, headers, container load props, and snapshot fetch options.
- Existing request headers remain preserved.
- No code claims that ODSP already satisfies historical loading.
- The `getSnapshotTree` limitation is understood.
- Tests only assert behavior that the current implementation actually provides.
