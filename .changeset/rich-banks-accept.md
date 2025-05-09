---
"@fluidframework/container-definitions": minor
"@fluidframework/container-loader": minor
"fluid-framework": minor
"__section": breaking
---
IContainer.getContainerPackageInfo removed

`IContainer.getContainerPackageInfo()` was set to be removed in release 2.40.0. To access the package name `getContainerPackageInfo()` provided, use `IFluidCodeDetails.package` returned by `IContainer.getLoadedCodeDetails()`.

See [issue #23898](https://github.com/microsoft/FluidFramework/issues/23898) for more information.
