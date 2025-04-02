---
"@fluid-experimental/attributor": minor
"@fluidframework/container-runtime": minor
"@fluidframework/datastore": minor
"@fluidframework/runtime-definitions": minor
"@fluidframework/test-runtime-utils": minor
---
---
"section": legacy
---

Tighten DataStore messaging parameter typing

Introduce new alternatives for `IFluidParentContext.submitMessage` and `IFluidDataStoreChannel.reSubmit` to limit to supported message structures.

The old forms are deprecated. Conversion to from deprecated form to safe form requires combining the first two parameters to a structure of `{ type: <type>, content: <content> }`.

`FluidDataStoreRuntime.submitMessage` implementation is not required per `IFluidDataStoreChannel` and is now deprecated. `IFluidParentContext` (which is base interface for `IFluidDataStoreContext`) should always be used to access `submitMessage` functionality.
