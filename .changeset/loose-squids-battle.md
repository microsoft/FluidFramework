---
"@fluidframework/datastore": minor
"@fluidframework/test-runtime-utils": minor
"__section": deprecation
---
Deprecate submitMessage on FluidDataStoreRuntime and MockFluidDataStoreRuntime

As needed, access `submitMessage` via `IFluidDataStoreContext`/`IFluidParentContext`. See https://github.com/microsoft/FluidFramework/issues/24406 for details.
