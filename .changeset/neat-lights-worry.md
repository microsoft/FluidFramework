---
"@fluidframework/runtime-definitions": minor
"@fluidframework/test-runtime-utils": minor
---
---
"section": deprecation
---

The function `process` has been deprecated on the following interface - `IFluidDataStoreChannel`. It has also been deprecated on the following mock test class - `MockFluidDataStoreRuntime`.

A new function `processMessages` has been added in its place which will be called to process multiple messages instead of a single one on the channel. This is part of a feature called "Op bunching" where contiguous ops of a given type and to a given data store / DDS are bunched and sent together for processing.

Implementations of `IFluidDataStoreChannel` must now also implement `processMessages`. For a reference implementation, see `FluidDataStoreRuntime::processMessages`.
