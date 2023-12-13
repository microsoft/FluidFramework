---
"@fluidframework/container-definitions": major
---

container-definitions: Removed request(...) and IFluidRouter from IContainer

The `request(...)` method and `IFluidRouter` property have been removed from `IContainer`. Please use the
`IContainer.getEntryPoint()` method to get the container's entry point.

See [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md) for more details.
