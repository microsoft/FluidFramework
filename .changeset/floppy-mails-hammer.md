---
"@fluidframework/container-definitions": major
"@fluidframework/container-loader": major
---

container-loader: Removed request(...) and IFluidRouter from ILoader and Loader

The `request(...)` method and `IFluidRouter` property have been removed from `ILoader` and `Loader`. Instead, after
calling `ILoader.resolve(...)`, call the `getEntryPoint()` method on the returned `IContainer`.

See
[Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md)
for more details.
