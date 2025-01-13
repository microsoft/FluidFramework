---
"@fluidframework/aqueduct": minor
"@fluidframework/container-runtime": minor
"@fluidframework/container-runtime-definitions": minor
"@fluidframework/datastore": minor
"@fluidframework/runtime-definitions": minor
"@fluidframework/test-runtime-utils": minor
---

The createDataStoreWithProps APIs on ContainerRuntime and IContainerRuntimeBase have been removed

`ContainerRuntime.createDataStoreWithProps` and `IContainerRuntimeBase.createDataStoreWithProps`
were [deprecated in version 0.25.0](https://github.com/microsoft/FluidFramework/blob/main/BREAKING.md#icontainerruntimebase_createdatastorewithprops-is-removed) and have been removed.

Replace uses of these APIs with `PureDataObjectFactory.createInstanceWithDataStore` and pass in props via the `initialState`
parameter.

These changes were originally announced in version 0.25.0. See the following issues for more details:

- [#1537](https://github.com/microsoft/FluidFramework/issues/1537)
- [#2931](https://github.com/microsoft/FluidFramework/pull/2931)
