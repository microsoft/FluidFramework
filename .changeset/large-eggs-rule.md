---
"@fluidframework/container-runtime": major
---

New required method `getAliasedDataStoreEntryPoint` in ContainerRuntime

`getAliasedDataStoreEntryPoint` API has been added to ContainerRuntime. This can be used to get the entry point to an aliased data stores. To use this API `initializeEntryPoint` must be provided when creating `FluidDataStoreRuntime` [here](https://github.com/microsoft/FluidFramework/blob/main/packages/runtime/datastore/src/dataStoreRuntime.ts#L243). `getAliasedDataStoreEntryPoint` and `initializeEntryPoint` will become required in a future release.
