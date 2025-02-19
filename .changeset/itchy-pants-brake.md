---
"@fluidframework/shared-object-base": minor
---
---
"section": other
---

Change when the `pre-op` and `op` events on `ISharedObjectEvents` are emitted

Previous behavior - `pre-op` was emitted immediately before an op was processed. Then the op was processed and `op` was emitted immediately after that.

New behavior - `pre-op` will still be emitted before an op is processed and `op` will still be emitted after an op is processed. However, these won't be immediate and other ops in a batch for the shared object may be processed in between.

Note that these events are for internal use only as mentioned in the @remarks section of their definition.
