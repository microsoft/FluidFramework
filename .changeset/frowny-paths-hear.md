---
"@fluidframework/datastore": minor
"@fluidframework/test-runtime-utils": minor
"__section": legacy
---

Deprecate submitMessage on FluidDataStoreRuntime and MockFluidDataStoreRuntime

Implementing `FluidDataStoreRuntime.submitMessage` is not required per `IFluidDataStoreChannel` and is now deprecated on `FluidDataStoreRuntime` and corresponding `MockFluidDataStoreRuntime`.

See [issue #24406](https://github.com/microsoft/FluidFramework/issues/24406) for details and alternatives.
