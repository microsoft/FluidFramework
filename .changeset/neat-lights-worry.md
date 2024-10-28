---
"@fluidframework/datastore-definitions": minor
"@fluidframework/runtime-definitions": minor
"@fluidframework/test-runtime-utils": minor
---
---
"section": deprecation
---

The function `process` has been deprecated on the following interface - `IFluidDataStoreChannel`. It has also been deprecated on the following mock test class - `MockFluidDataStoreRuntime`.

A new function `processMessages` has been added in its place which will be called to process multiple messages instead of a single one on the channel. This is part of a feature called "Op bunching" where contiguous ops of a given type and to a given data store / DDS are bunched and sent together for processing.

Implementations of `IFluidDataStoreChannel` must now also implement `processMessages`. For a reference implementation, see `FluidDataStoreRuntime::processMessages`.

---
"section": other
---

The timing of the `op` event on `IFluidDataStoreRuntimeEvents` and `IContainerRuntimeBaseEvents` has changed.

Previous behavior - It was emitted immediately after an op was processed and before the next op was processed.

New behavior - It will still be emitted after an op is processed but it may not be immediate. Other ops in a batch may be processed before the op event is emitted for an op.
