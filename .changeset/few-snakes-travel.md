---
"@fluidframework/container-definitions": minor
"__section": legacy
---
Introduced new interface "IContainerStorageService" to replace "IDocumentStorageService" between Loader and Runtime layers

Added an interface `IContainerStorageService` which will replace `IDocumentStorageService` in the `Runtime` layer. This is exposed by the `Loader` layer to the `Runtime` layer via `ContainerContext`. This will help remove `Runtime` layer's dependency on the `Driver` layer and replace it with the `Loader` layer that it already maintains. This new interface will only contain properties that are needed and used by the `Runtime` layer.

The following properties from `IContainerStorageService` are deprecated as they are not needed by the `DataStore` layer. These be removed in a future release:

- `policies` - The Runtime only needs `maximumCacheDurationMs` property from it which is added directly on `IContainerStorageService`.
- `downloadSummary`
- `disposed`
- `dispose`
