---
"@fluidframework/container-definitions": minor
"@fluidframework/runtime-definitions": minor
"__section": breaking
---
Removed deprecated properties from "IRuntimeStorageService" and "IContainerStorageService"

The following deprecated properties have been removed from `IRuntimeStorageService`:

- `disposed`
- `dispose`
- `policies`
- `getSnapshotTree`
- `getSnapshot`
- `getVersions`
- `createBlob`
- `uploadSummaryWithContext`
- `downloadSummary`

The following deprecated properties have been removed from `IContainerStorageService`:

- `downloadSummary`
- `disposed`
- `dispose`

The deprecations were announced in release 2.52.0 [here](https://github.com/microsoft/FluidFramework/releases/tag/client_v2.52.0).
