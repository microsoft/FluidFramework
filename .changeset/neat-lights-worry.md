---
"@fluidframework/runtime-definitions": minor
"@fluidframework/test-runtime-utils": minor
---
---
"section": deprecation
---

The function `process` on `IFluidDataStoreChannel` and `MockFluidDataStoreRuntime` is now deprecated.

A new function `processMessages` has been added in its place which will be called to process multiple messages instead of a single one on the channel. This is part of a feature called "Op bunching" where contiguous ops of a given type and to a given data store / DDS are bunched and sent together for processing.

Implementations of `IFluidDataStoreChannel` must now also implement `processMessages`. For a reference implementation, see `FluidDataStoreRuntime::processMessages`.
