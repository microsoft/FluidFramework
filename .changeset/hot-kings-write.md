---
"@fluidframework/aqueduct": major
"@fluidframework/container-runtime": major
"@fluidframework/data-object-base": major
"@fluidframework/datastore": major
---

`initializeEntryPoint` will become required

The optional `initializeEntryPoint` method has been added to a number of constructors. This method argument will become required and a value will need to be provided to the following classes:

-   `BaseContainerRuntimeFactory`
-   `ContainerRuntimeFactoryWithDefaultDataStore`
-   `RuntimeFactory`
-   `ContainerRuntime` (constructor and `loadRuntime`)
-   `FluidDataStoreRuntime`

For an example implementation of `initializeEntryPoint`, see [pureDataObjectFactory.ts](../packages/framework/aqueduct/src/data-object-factories/pureDataObjectFactory.ts#L83).
