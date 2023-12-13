---
"@fluidframework/container-runtime": major
"@fluidframework/container-runtime-definitions": major
"@fluidframework/core-interfaces": major
---

container-runtime-definitions: Removed getRootDataStore

The `getRootDataStore` method has been removed from `IContainerRuntime` and `ContainerRuntime`. Please migrate all usage to the new `getAliasedDataStoreEntryPoint` method. This method returns the data store's entry point which is its `IFluidHandle`.

See [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md) for more details.
