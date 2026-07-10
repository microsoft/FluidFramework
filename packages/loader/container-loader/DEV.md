# Historical Loading Notes

This document explains historical loading in Fluid Framework.
It starts with the product idea and then moves into the implementation details.

Historical loading means loading a Fluid document as it existed at an earlier point in time instead of loading the latest version.

## Why this exists

Most Fluid loads open the latest document state.
Some experiences need something different: they need to inspect the document at a specific point in its history.

The motivating scenario for this flow is NITL.
Copilot can make a change to a document, and that change can be auto-approved.
After approval, the experience needs to load or inspect the document at the exact point represented by that approved change, even if more edits happen later.

Examples:

- Show the document state produced by an auto-approved Copilot change.
- Show what the document looked like when a user performed an action.
- Compare current state with an earlier state.
- Investigate or explain a historical change.

For this work, the historical point is identified by a Fluid `sequenceNumber`.
A `sequenceNumber` is the global order number assigned to each operation in the document.

## The short story

Historical loading has four main steps:

1. The caller chooses the historical point it wants, called target `T`.
2. The loader carries `T` down through the load path.
3. The ODSP driver finds a snapshot at or before `T`.
4. Fluid replays operations after that snapshot until the document reaches `T`.

```text
choose target T
	-> find a base snapshot at or before T
	-> replay operations after the snapshot
	-> stop when the document reaches T
```

The result is a usable container whose state matches the requested point in history.
This is what this document means by materializing a point in time.

## Key terms

### Sequence number

A `sequenceNumber` is the global position of an operation in the document history.
It is the shared coordinate used by snapshots, operations, and replay.

### Target

The target is the sequence number the caller wants to load to.
This document usually calls it `T`.

### Snapshot

A snapshot is saved document state at some sequence number.
It is a starting point, not necessarily the exact requested historical point.

### Base snapshot

The base snapshot is the snapshot Fluid starts from when reconstructing the requested historical state.
It must be at or before the target.

### Replay

Replay means applying operations after the base snapshot until the container reaches the target sequence number.

### Materialize

To materialize a point in time means to reconstruct an actual usable container state for that point.
It is more than finding a snapshot; it may also require replaying operations after the snapshot.

## Conceptual flow

```mermaid
flowchart TD
	A[Caller asks for point-in-time target T] --> B{Availability probe or load?}
	B -->|Probe| C[ODSP searches for a base snapshot at or before T]
	C --> D{Base snapshot found?}
	D -->|No| E[Report missingBaseVersion]
	D -->|Yes| F[Fetch replay ops from base snapshot to T]
	F --> G{Replay ops complete?}
	G -->|No| H[Report missingOps]
	G -->|Yes| I[Report materializable]
	B -->|Load| J[Loader carries T through the load path]
	J --> K[ODSP driver receives T during snapshot fetch]
	K --> L{Can ODSP find a base snapshot at or before T?}
	L -->|No| M[Fail clearly]
	L -->|Yes| N[Return base snapshot]
	N --> O{Is the snapshot already at T?}
	O -->|Yes| P[Pause and return container]
	O -->|No, snapshot is before T| Q[Replay operations until T]
	O -->|No, snapshot is after T| R[Fail because Fluid cannot replay backward]
	Q --> P
```

## What each layer is responsible for

### Host or app

The host decides which historical point it wants.
It should provide a target sequence number, not a snapshot id and not a client-local marker.

If the host starts with an app marker, it must first resolve that marker to a global sequence number.

### Container loader

The loader carries the target through the load path.
It does not know whether the service has the needed historical data.
It should not try to validate service-specific history.

### ODSP driver

For this flow, ODSP receives the target and decides how to find a useful base snapshot.
It searches recent ODSP versions and chooses a snapshot at or before the target.

### Runtime and delta processing

After the base snapshot is loaded, Fluid may need to apply operations after that snapshot.
This replay step is what brings the container from the base snapshot to the requested target.

## Detailed layer flow

The conceptual flow above hides some implementation details.
This diagram shows how the same target moves through the loader, container, storage boundary, ODSP, and replay layers.

```mermaid
flowchart TD
	subgraph HostApp[Host or app layer]
		A[Caller requests existing container]
		B{Point-in-time target?}
	end

	subgraph LoaderHelpers[Container-loader helper layer]
		C[loadExistingContainer]
		D[loadExistingContainer adds LoaderHeader.sequenceNumber = T]
		E[Loader.resolve]
		Y[Load with deltaConnection none and opsBeforeReturn undefined]
		Z[Install op/closed/abort listeners]
		AA{Base snapshot sequence}
		AB[Pause inbound and outbound queues immediately]
		AC[Close container: snapshot is newer than target]
		AD[container.connect fetches trailing ops]
		AE[Process ops until deltaManager.lastSequenceNumber reaches T]
		AF[Disconnect and return paused readonly container]
	end

	subgraph ContainerLoad[Container load layer]
		F[Container.load receives loadToSequenceNumber]
		G[SerializedStateManager.fetchSnapshot]
		V[Container initializes from base snapshot]
		W{Using loadContainerPaused?}
		X[Normal container load continues]
	end

	subgraph StorageBoundary[Storage boundary]
		H[IDocumentStorageService.getSnapshot options include loadToSequenceNumber when present]
		AG[IDocumentStorageServiceAlpha.canMaterializePointInTime]
	end

	subgraph OdspDriver[ODSP driver layer]
		I{ODSP getSnapshot sees loadToSequenceNumber?}
		J[Normal latest snapshot flow]
		K[Use latest/cache/network snapshot path]
		L[Return latest snapshot]
		M[Point-in-time ODSP snapshot flow]
		N[getVersions top 50, no cache]
		O[For each version: getSnapshotTree]
		P[Read document attributes blob]
		Q[Extract snapshot sequenceNumber]
		R{sequenceNumber at or before T?}
		S[Return first usable base snapshot]
		T[ISnapshot sequenceNumber = base snapshot sequenceNumber]
		U[Throw non-retryable error: no snapshot at or before target]
		AH[Find point-in-time base snapshot]
		AI{Base snapshot found?}
		AJ[Fetch replay ops from delta storage]
		AK{Replay ops complete and contiguous through T?}
		AL[Return materializable]
		AM[Return missingBaseVersion]
		AN[Return missingOps]
	end

	A --> B
	B -->|No| C
	B -->|Yes: loadToSequenceNumber = T| D
	C --> E
	D --> E
	E --> F
	F --> G
	G --> H
	H --> I
	I -->|No| J
	J --> K
	K --> L
	L --> V
	I -->|Yes| M
	M --> N
	N --> O
	O --> P
	P --> Q
	Q --> R
	R -->|No| O
	R -->|Yes| S
	S --> T
	R -->|No candidate found| U
	T --> V
	V --> W
	W -->|No| X
	W -->|Yes| Y
	Y --> Z
	Z --> AA
	AA -->|At T| AB
	AA -->|After T| AC
	AA -->|Before T| AD
	AD --> AE
	AE --> AB
	AB --> AF
	B -->|Probe availability| AG
	AG --> AH
	AH --> AI
	AI -->|No| AM
	AI -->|Yes| AJ
	AJ --> AK
	AK -->|Yes| AL
	AK -->|No| AN
```

## Why the target is a sequence number

Fluid operations are ordered by sequence number.
Snapshots record sequence numbers.
Delta storage fetches operations by sequence ranges.
Replay also uses sequence numbers.

That makes sequence number the most natural way to say:

```text
Load the document as it existed at this global point in history.
```

A snapshot id alone is not enough because the target may fall between two snapshots.

## Caller-facing load shape

Callers can request historical loading by providing `loadToSequenceNumber` through the alpha load props:

```typescript
const loadProps: ILoadExistingContainerPropsAlpha = {
	request,
	loadToSequenceNumber: 123,
};

await loadExistingContainer(loadProps);
```

Internally, this is carried through the existing loader sequence-number header:

```typescript
LoaderHeader.sequenceNumber // "fluid-sequence-number"
```

Typed props win over any existing sequence-number header when both are present.
Other request headers are preserved.

## Loader propagation

The loader propagation is intentionally simple:

1. `loadExistingContainer` writes the target into request headers.
2. `Loader.resolve` reads the target from request headers.
3. `Container.load` receives the target as part of load props.
4. `SerializedStateManager.fetchSnapshot` passes the target to snapshot fetch.
5. `IDocumentStorageService.getSnapshot` receives the target in snapshot fetch options.

The loader does not decide which historical snapshot to use.
For this flow, that decision belongs to the ODSP driver.

## Replay and pause

`loadContainerPaused` is the helper that proves Fluid can replay to a target and then stop.

It works like this:

1. Load the container without processing trailing operations yet.
2. Install listeners so the helper can see when operations are processed.
3. Connect just long enough to fetch and process operations.
4. Pause once the container reaches the requested sequence number.
5. Disconnect and return the paused readonly container.

Important cases:

- If the base snapshot is already at the target, Fluid pauses immediately.
- If the base snapshot is before the target, Fluid replays forward.
- If the base snapshot is after the target, Fluid fails because it cannot replay backward.

## ODSP behavior

ODSP has two snapshot paths:

- Normal load: return the latest snapshot, using the usual latest/cache path.
- Historical load: search for a base snapshot at or before the requested target.

For historical loads, ODSP intentionally skips the latest snapshot cache.
A cached latest snapshot may be newer than the target, and a newer snapshot cannot be replayed backward.

ODSP historical snapshot selection works like this:

1. List recent ODSP versions.
2. Read each candidate snapshot tree.
3. Read the document attributes for that candidate.
4. Find the candidate's sequence number.
5. Return the first candidate whose sequence number is at or before the target.

If no candidate exists, ODSP fails clearly instead of returning latest.
Returning latest would make the caller think the historical target was honored when it was not.

ODSP only chooses the base snapshot in this step.
It does not prove that all operations after the snapshot are still available.

ODSP emits `HistoricalSnapshotSelection` telemetry for point-in-time loads.
The event records the target sequence number, number of versions scanned, number of candidate snapshot reads, whether a base snapshot was found, the chosen base snapshot sequence number when available, and the replay distance from base snapshot to target when available.

## Availability checks

Hosts may want to ask whether a historical point appears loadable before doing a full load.
That is what the point-in-time availability API is for.

The availability check answers questions like:

- Did ODSP find a base snapshot?
- Are the operations needed to replay from that snapshot to the target available?
- Is the document or version history inaccessible?
- Is the result unknown for some other reason?

For ODSP today, `materializable` means:

```text
ODSP found a base snapshot at or before the target and verified that the replay ops are available.
```

### Availability statuses

Current or planned statuses include:

- `materializable`: a usable base snapshot was found and the required trailing operations are available.
- `missingBaseVersion`: no usable base snapshot was found.
- `permissionOrAccessDenied`: the document or version history could not be accessed.
- `notAvailable`: the availability probe is not available or could not determine availability.
- `missingOps`: a base snapshot exists but required trailing operations are missing.

## What this implementation guarantees

This implementation guarantees that:

- A caller can express a historical target as a sequence number.
- The loader carries that target down to storage snapshot fetch.
- ODSP uses a historical snapshot search when it sees the target.
- ODSP fails when it cannot find a usable base snapshot.
- Hosts can ask ODSP whether the point-in-time load appears available.
- ODSP reports `missingOps` when a usable base snapshot exists but the required replay operations are unavailable.

## What this implementation does not guarantee

This implementation does not guarantee that:

- This flow works for non-ODSP drivers.
- A snapshot fetch alone produces the final historical state.
- Every requested point-in-time load is available; ODSP may still report missing base versions or missing replay operations.

## Technical reference

This section lists the main files and API names for contributors who need to work on the code.

### Caller-facing target

- `packages/common/container-definitions/src/loader.ts` defines `LoaderHeader.sequenceNumber`.
- `packages/loader/container-loader/src/createAndLoadContainerUtils.ts` defines `ILoadExistingContainerPropsAlpha.loadToSequenceNumber`.

### Loader and container propagation

- `packages/loader/container-loader/src/loader.ts` reads the target from request headers.
- `packages/loader/container-loader/src/container.ts` carries the target on `IContainerLoadProps` and forwards it into snapshot fetch.
- `packages/loader/container-loader/src/serializedStateManager.ts` passes the target into `getSnapshot` options when loading from storage.
- `packages/loader/container-loader/src/loadPaused.ts` replays operations forward and pauses once the requested sequence number is reached.

### Storage and driver APIs

- `packages/common/driver-definitions/src/storage.ts` defines `ISnapshotFetchOptionsAlpha.loadToSequenceNumber`.
- `packages/common/driver-definitions/src/storage.ts` defines `IPointInTimeMaterializationTarget`, `PointInTimeMaterializationAvailability`, and `IDocumentStorageServiceAlpha.canMaterializePointInTime`.

### Storage wrappers and ODSP implementation

- `packages/loader/container-loader/src/containerStorageAdapter.ts` forwards `canMaterializePointInTime` to storage.
- `packages/loader/container-loader/src/retriableDocumentStorageService.ts` forwards `canMaterializePointInTime` through retry behavior.
- `packages/loader/container-loader/src/protocolTreeDocumentStorageService.ts` forwards `canMaterializePointInTime` through protocol-tree wrapping.
- `packages/drivers/odsp-driver/src/odspDocumentStorageManager.ts` implements ODSP historical snapshot selection, base-version availability checks, and replay-op availability checks.

## Testing guidance

Tests should cover behavior the current implementation actually provides:

- `loadExistingContainer` forwards `loadToSequenceNumber` into `LoaderHeader.sequenceNumber`.
- Existing request headers are preserved while target headers are added or overwritten by typed props.
- `SerializedStateManager.fetchSnapshot` passes `loadToSequenceNumber` into snapshot fetch options when loading from storage.
- `loadContainerPaused` pauses when the requested sequence number is reached.
- ODSP `getSnapshot({ loadToSequenceNumber })` selects the closest recent snapshot at or before the target.
- ODSP `getSnapshot({ loadToSequenceNumber })` fails when recent versions contain no usable base snapshot.
- ODSP `canMaterializePointInTime` reports `materializable` when a usable base snapshot exists and required replay ops are available.
- ODSP `canMaterializePointInTime` reports `missingBaseVersion` when recent versions contain no usable base snapshot.
- ODSP `canMaterializePointInTime` reports `missingOps` when a usable base snapshot exists but required replay ops are missing.
- ODSP `canMaterializePointInTime` reports `permissionOrAccessDenied` for access-related ODSP failures.

Tests should avoid claiming that this flow works for non-ODSP drivers.
For ODSP, tests can claim base snapshot selection, but full final materialization requires replay to the requested target.

As ODSP support expands, add tests for:

- Successful historical materialization at a requested sequence number.
- Loading when the base snapshot is older than the target and trailing operations are required.
- Failure when trailing operations are unavailable.
- Cache and no-cache behavior.
- Telemetry or error properties that help diagnose unavailable historical loads.

## Reviewer checklist

Reviewers should verify that:

- The target is not dropped between helper props, headers, container load props, and snapshot fetch options.
- Existing request headers remain preserved.
- Loader code does not try to validate service-specific historical availability.
- ODSP historical `getSnapshot` does not fall back to latest when no usable historical base snapshot exists.
- Availability statuses do not over-claim trailing operation or marker retention support.
- Tests only assert behavior that the current implementation actually provides.
