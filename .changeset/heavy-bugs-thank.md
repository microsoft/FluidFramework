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

The deprecations were announced in version [2.52.0](https://github.com/microsoft/FluidFramework/releases/tag/client_v2.52.0).
