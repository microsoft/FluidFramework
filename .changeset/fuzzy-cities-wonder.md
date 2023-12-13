---
"@fluidframework/datastore": major
---

datastore: Removed `FluidDataStoreRuntime.load(...)`

The static method `FluidDataStoreRuntime.load(...)` has been removed. Please migrate all usage of this method to
`FluidDataStoreRuntime` constructor.
