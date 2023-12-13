---
"@fluidframework/core-interfaces": major
---

core-interfaces: Removed IFluidRouter and IProvideFluidRouter

The `IFluidRouter` and `IProvideFluidRouter` interfaces have been removed. Please migrate all usage to the new `entryPoint` pattern.

See [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md) for more details.
