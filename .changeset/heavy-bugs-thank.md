---
"@fluidframework/container-definitions": minor
"@fluidframework/runtime-definitions": minor
"__section": breaking
---
Deprecated properties have been removed from IRuntimeStorageService and IContainerStorageService

The following deprecated properties have been removed from `IRuntimeStorageService`:

- `createBlob`
- `dispose`
- `disposed`
- `downloadSummary`
- `getSnapshot`
- `getSnapshotTree`
- `getVersions`
- `policies`
- `uploadSummaryWithContext`

The following deprecated properties have been removed from `IContainerStorageService`:

- `dispose`
- `disposed`
- `downloadSummary`

Please see [this Github issue](https://github.com/microsoft/FluidFramework/issues/25069) for more details.
