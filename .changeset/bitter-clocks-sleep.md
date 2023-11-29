---
"@fluidframework/container-definitions": major

"@fluidframework/container-loader": major
"@fluidframework/container-runtime": major
"@fluidframework/core-interfaces": major
"@fluid-experimental/devtools-core": major
"@fluid-private/test-end-to-end-tests": major
"@fluidframework/test-runtime-utils": major
"@fluid-tools/webpack-fluid-loader": major
---

Removed `request(...)` and `IFluidRouter` from `IContainer`

The `request(...)` method and `IFluidRouter` property have been removed from `IContainer`. Please use the `IContainer.getEntryPoint()` method to get the container's entry point.

See [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md) for more details.
