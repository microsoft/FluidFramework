---
"@fluidframework/datastore-definitions": major
---

datastore-definitions: Removed request and IFluidRouter from IFluidDataStoreRuntime

The `request` method and `IFluidRouter` property have been removed from `IFluidDataStoreRuntime`. Please migrate all
usage to the `IFluidDataStoreRuntime.entryPoint` API.

See
[Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md)
for more details.
