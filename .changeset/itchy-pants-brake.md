---
"@fluidframework/shared-object-base": minor
---
---
"section": other
---

Changes to the pre-op and op events on ISharedObjectEvents

Previously, `pre-op` event was emitted immediately before an op was processed, then the op was processed and the `op` event was emitted immediately after that.

As of version 2.23.0, the `pre-op` event will still be emitted before an op is processed and the `op` event will still be emitted after an op is processed. However, other ops in the same batch for this shared object may be processed in between.

Note that these events are for internal use only as mentioned in the @remarks section of their definition.
