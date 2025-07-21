---
"@fluidframework/container-definitions": minor
"__section": deprecation
---
Deprecated "policies" and "downloadSummary" on "IContainerStorageService"

`IContainerStorageService` is a duplicate of `IDocumentStorageService`. It is exposed to the `ContainerRuntime` via a property on `IContainerContext` and will only contain properties needs by it.
The property `downloadSummary`  on `IContainerStorageService` is deprecated as it is unused in the Runtime layer. No replacement is provided and this will be removed in a future release.
The property `policies`  on `IContainerStorageService` is deprecated. The Runtime only needs `maximumCacheDurationMs` property from it which is added directly on `IContainerStorageService`. `policies` will be removed in a future release.
