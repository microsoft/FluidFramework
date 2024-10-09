---
"@fluidframework/container-runtime": minor
---
---
"section": other
---

Minor adjustment to the event args for ContainerRuntime 'batchStart'/'batchEnd' events

The 'batchStart'/'batchEnd' events on ContainerRuntime indicate when a batch is beginning/finishing being processed.
The events include an argument of type `ISequencedDocumentMessage` which is the event representing the start or end of the batch.
The `contents` property on there is typed as `unknown`, as it depends on the type of op and where in the processing flow we are.

This change is switching the value of `contents` in some cases from being an object to being a JSON string.
It's not expected that anyone listening to 'batchStart'/'batchEnd' events would be inspecting the contents,
and if they are, they must be respecting the `unknown` type and checking its shape at runtime, so this is
not considered a breaking change.
