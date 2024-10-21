---
"@fluidframework/runtime-definitions": minor
---
---
"section": other
---

ContainerRuntime's 'batchBegin'/'batchEnd' events: Removing the `contents` property on event arg `op`

The 'batchBegin'/'batchEnd' events on ContainerRuntime indicate when a batch is beginning/finishing being processed.
The `contents` property on there is not useful or relevant when reasoning over incoming changes at the batch level.
So it has been removed from the `op` event arg.
