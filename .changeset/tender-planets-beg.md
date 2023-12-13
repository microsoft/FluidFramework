---
"@fluidframework/runtime-definitions": major
---

runtime-definitions: Removed request and IFluidRouter from IDataStore

The `request` method and `IFluidRouter` property have been removed from `IDataStore`. Please migrate all usage to the `IDataStore.entryPoint` API.

See [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md) for more details.
