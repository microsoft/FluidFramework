---
"@fluidframework/agent-scheduler": major
"@fluidframework/aqueduct": major
"@fluidframework/container-definitions": major
"@fluidframework/container-loader": major
"@fluidframework/container-runtime": major
"@fluidframework/data-object-base": major
"@fluidframework/datastore": major
"@fluidframework/datastore-definitions": major
"@fluid-experimental/devtools-core": major
"@fluidframework/fluid-runner": major
"@fluidframework/fluid-static": major
"@fluidframework/runtime-definitions": major
"@fluidframework/test-runtime-utils": major
"@fluidframework/test-utils": major
---

initializeEntryPoint is required

The optional `initializeEntryPoint` method has become required on a number of constructors. A value will need to be provided to the following classes:

-   `BaseContainerRuntimeFactory`
-   `ContainerRuntimeFactoryWithDefaultDataStore`
-   `RuntimeFactory`
-   `ContainerRuntime` (constructor and `loadRuntime`)
-   `FluidDataStoreRuntime`

See [testContainerRuntimeFactoryWithDefaultDataStore.ts](https://github.com/microsoft/FluidFramework/tree/main/packages/test/test-utils/src/testContainerRuntimeFactoryWithDefaultDataStore.ts) for an example implemtation of `initializeEntryPoint` for ContainerRuntime.
See [pureDataObjectFactory.ts](https://github.com/microsoft/FluidFramework/tree/main/packages/framework/aqueduct/src/data-object-factories/pureDataObjectFactory.ts#L83) for an example implementation of `initializeEntryPoint` for DataStoreRuntime.

Subsequently, various `entryPoint` and `getEntryPoint()` endpoints have become required. Please see [containerRuntime.ts](https://github.com/microsoft/FluidFramework/tree/main/packages/runtime/container-runtime/src/containerRuntime.ts) for example implementations of these APIs.
