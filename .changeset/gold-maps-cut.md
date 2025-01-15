---
"@fluidframework/aqueduct": minor
"@fluidframework/container-runtime": minor
"@fluidframework/container-runtime-definitions": minor
"@fluidframework/datastore": minor
"@fluidframework/runtime-definitions": minor
"@fluidframework/test-runtime-utils": minor
---

# The createDataStoreWithProps APIs on ContainerRuntime and IContainerRuntimeBase have been removed

`ContainerRuntime.createDataStoreWithProps` and `IContainerRuntimeBase.createDataStoreWithProps`
have been removed.

Replace uses of these APIs with `PureDataObjectFactory.createInstanceWithDataStore` and pass in props via the `initialState`
parameter.

# Initial deprecation/removal announcement

The initial deprecations of the now changed or removed types were announced [#1537](https://github.com/microsoft/FluidFramework/issues/1537)
in Fluid Framework v0.25 [#2931](https://github.com/microsoft/FluidFramework/pull/2931)
