---
"@fluidframework/container-definitions": minor
---

container-definitions: Deprecate IDeltaManager.inbound and IDeltaManager.outbound

`IDeltaManager.inbound` was deprecated because it was not very useful to the customer and there are pieces of
functionality that can break the core runtime if used improperly. For example, summarization and processing batches. Do
not use the apis on this if possible. Data loss/corruption may occur in these scenarios in which
`IDeltaManger.inbound.pause()` or `IDeltaManager.inbound.resume()` get called.

Deprecated `IDeltaManager.outbound` as it was not very useful to the customer and there are pieces of functionality
that can break the core runtime if used improperly. For example, generation of batches and chunking. Op batching and
chunking can be broken. Data loss/corruption may occur in these scenarios in which `IDeltaManger.inbound.pause()` or
`IDeltaManager.inbound.resume()` get called.

## Alternatives

-   Alternatives to `IDeltaManager.inbound.on("op", ...)` are `IDeltaManager.on("op", ...)`
-   Alternatives to calling `IDeltaManager.inbound.pause`, `IDeltaManager.outbound.pause` for `IContainer` disconnect
    use `IContainer.disconnect`.
-   Alternatives to calling `IDeltaManager.inbound.resume`, `IDeltaManager.outbound.resume` for `IContainer` reconnect
    use `IContainer.connect`.
