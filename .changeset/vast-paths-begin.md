---
"@fluidframework/datastore": minor
"@fluidframework/test-runtime-utils": minor
---
---
"section": legacy
---

Added ILayerCompatDetails property to FluidDataStoreRuntime, MockFluidDataStoreContext and MockFluidDataStoreRuntime

An optional property called `ILayerCompatDetails` is added to `FluidDataStoreRuntime`. This is queried by
`FluidDataStoreContext` in the `Runtime` layer to validate that the `Runtime` and `DataStore` layers are compatible.

`ILayerCompatDetails` is also added to `MockFluidDataStoreRuntime` and `MockFluidDataStoreContext` which are used for
testing because these mock classes are exported as legacy alpha.

Note that this property is for internal use only.
