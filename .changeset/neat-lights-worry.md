---
"@fluidframework/datastore-definitions": minor
"@fluidframework/runtime-definitions": minor
"@fluidframework/test-runtime-utils": minor
---
---
"section": deprecation
---

The function `process` has been deprecated on the following interfaces - `IFluidDataStoreChannel` and `IDeltaHandler`. It has also been deprecated on the following mock test classes - `MockDeltaConnection` and `MockFluidDataStoreRuntime`.

A new function `processMessages` has been added in its place which will be called to process multiple messages instead of a single one. This is part of a feature called "Op bunching" where contiguous ops of a given type and to a given data store / DDS are bunched and sent together for processing.
