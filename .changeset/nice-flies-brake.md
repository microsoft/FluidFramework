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

The inbound and outbound properties were deprecated in a previous release and have been removed from IDeltaManager. Please check pull request [#19636](https://github.com/microsoft/FluidFramework/pull/19636) for alternative APIs.

`IDeltaManager.inbound` was deprecated because it was not very useful to the customer and there are pieces of functionality that can break the core runtime if used improperly. For example, summarization and processing batches. Do not use the apis on this if possible. Data loss/corruption may occur in these scenarios in which `IDeltaManger.inbound.pause()` or `IDeltaManager.inbound.resume()` get called.

Deprecated `IDeltaManager.outbound` as it was not very useful to the customer and there are pieces of functionality that can break the core runtime if used improperly. For example, generation of batches and chunking. Op batching and chunking can be broken. Data loss/corruption may occur in these scenarios in which `IDeltaManger.inbound.pause()` or `IDeltaManager.inbound.resume()` get called.

### Alternatives

- Alternatives to `IDeltaManager.inbound.on("op", ...)` are `IDeltaManager.on("op", ...)`
- Alternatives to calling `IDeltaManager.inbound.pause`, `IDeltaManager.outbound.pause` for `IContainer` disconnect use `IContainer.disconnect`.
- Alternatives to calling `IDeltaManager.inbound.resume`, `IDeltaManager.outbound.resume` for `IContainer` reconnect use `IContainer.connect`.
