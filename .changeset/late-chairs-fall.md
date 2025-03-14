---
"@fluidframework/container-definitions": minor
"@fluidframework/container-loader": minor
---
---
"section": deprecation
---

IContainer.getContainerPackageInfo() is now deprecated

The `IContainer.getContainerPackageInfo()` function is now deprecated. This API will be removed in version 2.40.
Use `IFluidCodeDetails.package` returned by `IContainer.getLoadedCodeDetails()` instead.

See [issue #23898](https://github.com/microsoft/FluidFramework/issues/23898) for details.
