---
"@fluidframework/datastore": minor
---
---
"section": legacy
---

Deprecate `FluidDataStoreRuntime.submitMessage`

`FluidDataStoreRuntime.submitMessage` implementation is not required per `IFluidDataStoreChannel` and is now deprecated. `IFluidParentContext` (which is base interface for `IFluidDataStoreContext`) should always be used to access `submitMessage` functionality.
