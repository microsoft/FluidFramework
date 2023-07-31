---
"@fluidframework/container-runtime": major
"@fluidframework/container-runtime-definitions": major
---

`getRootDataStore` API is deprecated

The `getRootDataStore` API that was used to get aliased data store has been deprecated. It will be removed in a future release.
Use `getAliasedDataStoreAPI` to get aliased data stores instead. It returns the data store's entry point which is its `IFluidHandle`. To use this API `initializeEntryPoint` must be when provided creating `FluidDataStoreRuntime` [here](https://github.com/microsoft/FluidFramework/blob/7401729c533e7f2f412778c93e84f3cb34aed41b/packages/runtime/datastore/src/dataStoreRuntime.ts#L243). `initializeEntryPoint` will become required in a future release as well.
