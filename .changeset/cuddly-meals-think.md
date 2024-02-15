---
"@fluidframework/container-definitions": minor
---

## Overview

-   Deprecated `IDeltaManager.inbound` as it was not very useful to the customer and there are pieces of functionality
    that can break the core runtime if used improperly. For example, summarization and processing batches. Do not use
    the apis on this if possible. For alternatives to `IDeltaManager.inbound.on("op", ...)` are `IDeltaManager.on("op", ...)`
    Data loss/corruption may occur in these scenarios in which `IDeltaManger.inbound.pause()` or `IDeltaManager.inbound.resume()`
    get called.
-   Deprecated `IDeltaManager.outbound` as it was not very useful to the customer and there are pieces of functionality
    that can break the core runtime if used improperly. For example, generation of batches and chunking. Op batching and
    chunking can be broken. Data loss/corruption may occur in these scenarios in which `IDeltaManger.inbound.pause()` or
    `IDeltaManager.inbound.resume()` get called.
