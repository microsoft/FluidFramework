---
"@fluidframework/datastore-definitions": minor
"@fluidframework/runtime-definitions": minor
"@fluidframework/test-runtime-utils": minor
---
---
"section": deprecation
---

The function `process` has been deprecated on the following interface - `IFluidDataStoreChannel`. It has also been deprecated on the following mock test class - `MockFluidDataStoreRuntime`.

A new function `processMessages` has been added in its place which will be called to process multiple messages instead of a single one. This is part of a feature called "Op bunching" where contiguous ops of a given type and to a given data store / DDS are bunched and sent together for processing.

---
"section": other
---

The timing of the `op` event on `IFluidDataStoreRuntimeEvents` has changed.

Previous behavior - It was emitted after an op was processed and before the next op was processed.

New behavior - It will still be emitted after an op is processed. However, other ops for the data store in a batch may be processed before it is emitted.
