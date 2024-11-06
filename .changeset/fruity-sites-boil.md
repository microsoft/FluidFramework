---
"@fluidframework/runtime-definitions": minor
---
---
"section": other
---

Changes to the batchBegin and batchEnd events on ContainerRuntime

The 'batchBegin'/'batchEnd' events on ContainerRuntime indicate when a batch is beginning or finishing being processed. The `contents` property on the event argument `op` is not useful or relevant when reasoning over incoming changes at the batch level. Accordingly, it has been removed from the `op` event argument.
