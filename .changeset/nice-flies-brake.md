---
"@fluidframework/aqueduct": minor
"@fluidframework/container-definitions": minor
"@fluidframework/container-loader": minor
"@fluidframework/container-runtime": minor
"@fluidframework/container-runtime-definitions": minor
"@fluidframework/datastore": minor
"@fluidframework/devtools-core": minor
"@fluidframework/fluid-static": minor
"@fluidframework/runtime-definitions": minor
"@fluidframework/runtime-utils": minor
"@fluid-private/test-end-to-end-tests": minor
"@fluidframework/test-runtime-utils": minor
"@fluidframework/test-utils": minor
---
---
"section": legacy
---

The inbound and outbound properties have been removed from IDeltaManager

The inbound and outbound properties were [deprecated in version 2.0.0-rc.2.0.0](https://github.com/microsoft/FluidFramework/blob/main/RELEASE_NOTES/2.0.0-rc.2.0.0.md#container-definitions-deprecate-ideltamanagerinbound-and-ideltamanageroutbound) and have been removed from `IDeltaManager`.

`IDeltaManager.inbound` was deprecated because it was not very useful to the customer and there are pieces of functionality that can break the core runtime if used improperly. For example, summarization and processing batches. Do not use the apis on this if possible. Data loss/corruption may occur in these scenarios in which `IDeltaManger.inbound.pause()` or `IDeltaManager.inbound.resume()` get called.

Deprecated `IDeltaManager.outbound` as it was not very useful to the customer and there are pieces of functionality that can break the core runtime if used improperly. For example, generation of batches and chunking. Op batching and chunking can be broken. Data loss/corruption may occur in these scenarios in which `IDeltaManger.inbound.pause()` or `IDeltaManager.inbound.resume()` get called.

### Alternatives

- Alternatives to `IDeltaManager.inbound.on("op", ...)` are `IDeltaManager.on("op", ...)`
- Alternatives to calling `IDeltaManager.inbound.pause`, `IDeltaManager.outbound.pause` for `IContainer` disconnect use `IContainer.disconnect`.
- Alternatives to calling `IDeltaManager.inbound.resume`, `IDeltaManager.outbound.resume` for `IContainer` reconnect use `IContainer.connect`.
