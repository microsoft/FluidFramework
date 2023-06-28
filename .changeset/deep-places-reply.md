---
"@fluidframework/container-definitions": minor
"@fluidframework/container-loader": minor
"@fluidframework/container-runtime": minor
---

IContainerContext members deprecated

IContainerContext members disposed, dispose(), and id have been deprecated and will be removed in an upcoming release.

disposed - The disposed state on the IContainerContext is not meaningful to the runtime.

dispose() - The runtime is not permitted to dispose the IContainerContext, this results in an inconsistent system state.

id - The docId is already logged by the IContainerContext.taggedLogger for telemetry purposes, so this is generally unnecessary for telemetry.  If the id is needed for other purposes it should be passed to the consumer explicitly.
