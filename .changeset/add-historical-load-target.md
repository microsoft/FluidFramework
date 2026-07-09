---
"@fluidframework/container-definitions": minor
"@fluidframework/container-loader": minor
"@fluidframework/driver-definitions": minor
"@fluidframework/odsp-driver": minor
"__section": legacy
---

Add historical load target fields to loader APIs

Loader requests can now carry a target sequence number using the existing `LoaderHeader.sequenceNumber` request header.
Callers using `loadExistingContainer` can opt into the alpha `ILoadExistingContainerPropsAlpha` surface and pass `loadToSequenceNumber` and `loadToBatchId`, which are forwarded into request headers for the loader.
Storage drivers that implement `getSnapshot` can observe the alpha target options through `ISnapshotFetchOptionsAlpha.loadToSequenceNumber` and `ISnapshotFetchOptionsAlpha.loadToBatchId`.
ODSP now uses `loadToSequenceNumber` to list recent versions and select a historical base snapshot at or before the target, or strictly before the target when `loadToBatchId` is supplied so replay can validate batch metadata.
`loadContainerPaused` can replay ops from a suitable base snapshot and pause at the requested sequence number, optionally requiring matching batch metadata before pausing.
Hosts can also call the alpha `ContainerAlpha.canMaterializePointInTime` probe through `asLegacyAlpha(container)`, which delegates to optional alpha `IDocumentStorageServiceAlpha.canMaterializePointInTime` support when available.
ODSP implements the probe for base snapshot availability and reports whether a usable base snapshot exists, a base version is missing, access was denied, or availability is unknown. The availability vocabulary also reserves `missingOps` for the case where a base snapshot exists but the required replay range is no longer retained.

```typescript
const loadProps: ILoadExistingContainerPropsAlpha = {
	// ...
	request,
	loadToSequenceNumber: 123,
	loadToBatchId: "client_0_[42]",
};
await loadExistingContainer(loadProps);
```
