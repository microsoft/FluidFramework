---
"@fluidframework/datastore-definitions": minor
"@fluidframework/runtime-definitions": minor
---
---
"section": other
---

The op event on IFluidDataStoreRuntimeEvents and IContainerRuntimeBaseEvents is emitted at a different time

Previously, in versions 2.4 and below, the `op` event was emitted immediately after an op was processed and before the next op was processed.

In versions 2.5.0 and beyond, the `op` event will be emitted after an op is processed but it may not be immediate. In addition, other ops in a
batch may be processed before the op event is emitted for a particular op.
