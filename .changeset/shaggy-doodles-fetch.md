---
"@fluidframework/datastore": major
"@fluidframework/runtime-definitions": major
---

runtime-definitions: Removed IFluidRouter from IFluidDataStoreChannel and FluidDataStoreRuntime

The `IFluidRouter` property has been removed from `IFluidDataStoreChannel` and `FluidDataStoreRuntime`. Please migrate
all usage to the `IFluidDataStoreChannel.entryPoint` API.

See
[Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md)
for more details.
