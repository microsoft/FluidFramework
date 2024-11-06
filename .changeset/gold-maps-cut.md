---
"@fluidframework/aqueduct": minor
"@fluidframework/container-runtime": minor
"@fluidframework/container-runtime-definitions": minor
"@fluidframework/datastore": minor
"@fluidframework/runtime-definitions": minor
"@fluidframework/test-runtime-utils": minor
---

# The createDataStoreWithProps APIs on ContainerRuntime and IContainerRuntimeBase have been removed

Removed two main APIs, `ContainerRuntime.createDataStoreWithProps` and `IContainerRuntimeBase.createDataStoreWithProps`
has been removed.

Replace uses of these APIs with `PureDataObjectFactory.createInstanceWithDataStore` and pass in props via the `initialState`
parameter.
