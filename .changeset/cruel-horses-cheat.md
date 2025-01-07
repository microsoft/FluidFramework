---
"@fluidframework/container-runtime": minor
---
---
"section": legacy
---

IContainerRuntimeOptions.flushMode has been removed

This option allowed an application to specify whether to flush ops "immediately" (literally 1-by-1) or "turn-based"
(batched by JS turn). `Immediate` mode has been deprecated and should no longer be used.

Now there is only one choice, which is the default `TurnBased` mode, so the `Immediate` mode can be removed. 
