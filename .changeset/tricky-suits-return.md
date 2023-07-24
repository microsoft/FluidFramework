---
"@fluidframework/container-definitions": major
"@fluidframework/container-loader": major
---

`Loader.resolve()` throws if `LoaderHeader.sequenceNumber` and `IContainerLoadMode.opsBeforeReturn` do not match

Calling `Loader.resolve()` will now throw an error if `LoaderHeader.sequenceNumber` is defined but `IContainerLoadMode.opsBeforeReturn` is not set to "sequenceNumber". Vice versa, `Loader.resolve()` will also throw an error if `IContainerLoadMode.opsBeforeReturn` is set to "sequenceNumber" but `LoaderHeader.sequenceNumber` is not defined.
