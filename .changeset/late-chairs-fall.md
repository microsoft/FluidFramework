---
"@fluidframework/container-definitions": minor
"@fluidframework/container-loader": minor
---
---
"section": deprecation
---

IContainer.getContainerPackageInfo() is now deprecated

  This API will be removed in 2.40.0.
  Use IFluidCodeDetails.package returned by IContainer.getLoadedCodeDetails() instead.

  See [issue] (https://github.com/microsoft/FluidFramework/issues/23898) for context.
