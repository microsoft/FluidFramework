---
"@fluidframework/container-runtime": minor
---
---
"section": deprecation
---

The `op.contents` member on ContainerRuntime's `batchBegin`/`batchEnd` event args is deprecated

The `batchBegin`/`batchEnd` events on ContainerRuntime indicate when a batch is beginning/finishing being processed.
The events include an argument of type `ISequencedDocumentMessage` which is the first or last message of the batch.

The `contents` property of the `op` argument should not be used when reasoning over the begin/end of a batch.
If you want to look at the `contents` of an op, wait for the `op` event.
