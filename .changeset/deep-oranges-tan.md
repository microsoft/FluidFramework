---
"@fluidframework/container-runtime": major
"@fluidframework/container-runtime-definitions": major
---

`getRootDataStore` API is deprecated

The `getRootDataStore` API that is used to get aliased data store has been deprecated. It will be removed in a future release.
Use `getAliasedDataStoreEntryPoint` API to get aliased data stores instead. It returns the data store's entry point which is its `IFluidHandle`. To use this API `initializeEntryPoint` must be provided when creating `FluidDataStoreRuntime` [here](https://github.com/microsoft/FluidFramework/blob/main/packages/runtime/datastore/src/dataStoreRuntime.ts#L243). `getAliasedDataStoreEntryPoint` and `initializeEntryPoint` will become required in a future release.
