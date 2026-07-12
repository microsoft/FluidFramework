---
"@fluidframework/container-definitions": minor
"@fluidframework/container-loader": minor
"@fluidframework/driver-definitions": minor
"@fluidframework/odsp-driver": minor
"__section": legacy
---

Add an API for loading historical containers that stop at a target sequence number

Loader requests can now carry a target sequence number using the existing `LoaderHeader.sequenceNumber` request header.
Callers can use the alpha `loadContainerToSequenceNumber` API with `ILoadContainerToSequenceNumberProps.loadToSequenceNumber` to request a historical, read-only container view that stops at the requested sequence number.
The target reaches snapshot fetch through `ISnapshotFetchOptionsAlpha.loadToSequenceNumber`.
ODSP now uses `loadToSequenceNumber` to list recent versions and select a historical base snapshot at or before the target.
`loadContainerPaused` can replay ops from a suitable base snapshot and pause at the requested sequence number.
Hosts can also call the alpha `canMaterializePointInTime(container, target)` probe, which delegates to optional alpha `IPointInTimeMaterializationStorageService.canMaterializePointInTime` support when available.
ODSP implements the probe for base snapshot and replay-op availability and reports whether the point is materializable, the base version is missing, required ops are missing, access was denied, or availability is unknown.

```typescript
const loadProps: ILoadContainerToSequenceNumberProps = {
	// ...
	request,
	loadToSequenceNumber: 123,
};
await loadContainerToSequenceNumber(loadProps);
```
