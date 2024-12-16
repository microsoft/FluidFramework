---
"@fluidframework/container-runtime": minor
---
---
"section": legacy
---

IContainerRuntimeOptions.flushMode has been removed

This option allowed an application specify whether to flush ops "immediately" (literally 1-by-1) or "turn-based"
(batched by JS turn).  But `Immediate` mode has been deprecated and should no longer be used.

Now there is only one choice, which is the default `TurnBased` mode.  So we can simply remove this option.
