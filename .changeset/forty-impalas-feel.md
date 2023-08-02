---
"@fluidframework/container-definitions": major
"@fluidframework/container-runtime": major
"@fluidframework/datastore": major
"@fluidframework/datastore-definitions": major
"@fluidframework/runtime-definitions": major
"@fluidframework/test-runtime-utils": major
"@fluidframework/test-utils": major
---

Request APIs deprecated from many places

The `request` API (associated with the `IFluidRouter` interface) has been deprecated on a number of classes and interfaces. The following are impacted:

-   `IRuntime` and `ContainerRuntime`
-   `IFluidDataStoreRuntime` and `FluidDataStoreRuntime`
-   `IFluidDataStoreChannel`
-   `MockFluidDataStoreRuntime`
-   `TestFluidObject`

Please migrate usage to the corresponding `entryPoint` or `getEntryPoint()` of the object. The value for these "entryPoint" related APIs is determined from factories (for `IRuntime` and `IFluidDataStoreRuntime`) via the `initializeEntryPoint` method. If no method is passed to the factory, the corresponding `entryPoint` and `getEntryPoint()` will be undefined.

For an example implementation of `initializeEntryPoint`, see [pureDataObjectFactory.ts](../packages/framework/aqueduct/src/data-object-factories/pureDataObjectFactory.ts#L83).

More information of the migration off the request pattern, and current status of its removal, is documented in [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md).
