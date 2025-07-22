---
"@fluidframework/runtime-definitions": minor
"__section": deprecation
---
Introduced new interface "IRuntimeStorageService" to replace "IDocumentStorageService" between Runtime and DataStore layers

Added an interface `IRuntimeStorageService` which will replace `IDocumentStorageService` in the `DataStore` layer. This is exposed by the `Runtime` layer to the `DataStore` layer. This new interface will only contain properties that are needed and used by the `DataStore` layer.

The following properties from `IRuntimeStorageService` are deprecated as they are not needed by the `DataStore` layer. These be removed in a future release:

- `disposed`
- `dispose`
- `policies`
- `getSnapshotTree`
- `getSnapshot`
- `getVersions`
- `createBlob`
- `uploadSummaryWithContext`
- `downloadSummary`
