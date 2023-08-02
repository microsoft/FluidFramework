---
"@fluidframework/aqueduct": major
"@fluidframework/container-runtime": major
"@fluidframework/data-object-base": major
"@fluidframework/datastore": major
---

`initializeEntryPoint` will become required

The optional `initializeEntryPoint` method has been added to a number of constructors. **This method argument will become required in an upcoming release** and a value will need to be provided to the following classes:

-   `BaseContainerRuntimeFactory`
-   `ContainerRuntimeFactoryWithDefaultDataStore`
-   `RuntimeFactory`
-   `ContainerRuntime` (constructor and `loadRuntime`)
-   `FluidDataStoreRuntime`

For an example implementation of `initializeEntryPoint`, see [pureDataObjectFactory.ts](https://github.com/microsoft/FluidFramework/blob/main/packages/framework/aqueduct/src/data-object-factories/pureDataObjectFactory.ts#L84).

This work will replace the request pattern. See [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md) for more info on this effort.
