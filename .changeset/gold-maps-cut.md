---
"@fluidframework/aqueduct": minor
"@fluidframework/container-runtime": minor
"@fluidframework/container-runtime-definitions": minor
"@fluidframework/datastore": minor
"@fluidframework/runtime-definitions": minor
"@fluidframework/test-runtime-utils": minor
---

# Removed `_createDataStoreWithProps`

Removed two main APIs, `ContainerRuntime.createDataStoreWithProps` and `IContainerRuntimeBase.createDataStoreWithProps`
has been removed.

For alternative solutions use `PureDataObjectFactory.createInstanceWithDataStore` and pass in props via the `initialState`
parameter.
