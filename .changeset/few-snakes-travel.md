---
"@fluidframework/container-definitions": minor
"__section": deprecation
---
Deprecated "policies" and "downloadSummary" on "IRuntimeStorageService"

`IRuntimeStorageService` is a duplicate of `IDocumentStorageService`. It is exposed to the `ContainerRuntime` via a property on `IContainerContext`.
The property `downloadSummary`  on `IRuntimeStorageService` is deprecated as it is unused in the Runtime layer. No replacement is provided and this will be removed in a future release.
The property `policies`  on `IRuntimeStorageService` is deprecated. The Runtime only needs `maximumCacheDurationMs` property from it which is added directly on `IRuntimeStorageService`.
