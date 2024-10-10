---
"@fluidframework/container-runtime": minor
---
---
"section": other
---

ContainerRuntime's `batchBegin`/`batchEnd` events: Deprecating the `contents` member on event arg `op`

The `batchBegin`/`batchEnd` events on ContainerRuntime indicate when a batch is beginning/finishing being processed.
The events include an argument of type `ISequencedDocumentMessage` which is the first or last message of the batch.

The `contents` should not be used when reasoning over the begin/end of a batch.
If you want to look at the `contents` of an op, wait for the `op` event.
