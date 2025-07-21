---
"@fluidframework/runtime-definitions": minor
"__section": deprecation
---
Deprecated all properties except "readBlob" on "IRuntimeStorageService"

`IRuntimeStorageService` is a duplicate of `IDocumentStorageService`. It will be exposed by the `ContainerRuntime` to the `DataStore` layer and will only contain the `readBlob` property which it needs.
All other properties are deprecated and will be removed in a future release.
