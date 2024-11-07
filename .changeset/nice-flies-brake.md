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

`IDeltaManager.inbound` contained functionality that could break core runtime features such as summarization and processing batches if used improperly. Data loss or corruption could occur when `IDeltaManger.inbound.pause()` or `IDeltaManager.inbound.resume()` were called.

Similarly, `IDeltaManager.outbound` contained functionality that could break core runtime features such as generation of batches and chunking. Data loss or corruption could occur when `IDeltaManger.inbound.pause()` or `IDeltaManager.inbound.resume()` were called.

### Alternatives

- Alternatives to `IDeltaManager.inbound.on("op", ...)` are `IDeltaManager.on("op", ...)`
- Alternatives to calling `IDeltaManager.inbound.pause`, `IDeltaManager.outbound.pause` for `IContainer` disconnect use `IContainer.disconnect`.
- Alternatives to calling `IDeltaManager.inbound.resume`, `IDeltaManager.outbound.resume` for `IContainer` reconnect use `IContainer.connect`.
