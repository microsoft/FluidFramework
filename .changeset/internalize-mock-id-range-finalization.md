---
"@fluidframework/test-runtime-utils": minor
"__section": legacy
---
Remove direct ID range finalization from mock runtime APIs

`MockContainerRuntime.finalizeIdRange` is now private.
Mock runtimes continue to finalize ID ranges automatically when processing allocation messages.
Derived mock runtimes that customize message processing can use the protected `maybeProcessIdAllocationMessage` method to process allocation messages without depending on internal ID compressor types.
