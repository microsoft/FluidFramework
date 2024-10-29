---
"@fluidframework/datastore-definitions": minor
"@fluidframework/runtime-definitions": minor
---
---
"section": other
---

Change when the `op` event on `IFluidDataStoreRuntimeEvents` and `IContainerRuntimeBaseEvents` is emitted.

Previous behavior - It was emitted immediately after an op was processed and before the next op was processed.

New behavior - It will still be emitted after an op is processed but it may not be immediate. Other ops in a batch may be processed before the op event is emitted for an op.
