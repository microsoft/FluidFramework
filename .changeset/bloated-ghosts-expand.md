---
"@fluidframework/aqueduct": minor
---

aqueduct: PureDataObjectFactory.instantiateDataStore now returns IFluidDataStoreChannel

The return type of `PureDataObjectFactory.instantiateDataStore` was changed from `FluidDataStoreRuntime` to
`IFluidDataStoreChannel`.
