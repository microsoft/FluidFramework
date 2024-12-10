---
"@fluidframework/container-runtime": minor
---
---
"section": deprecation
---

Deprecating `IContainerRuntimeOptions.flushMode`

Only the default value `FlushMode.TurnBased` is supported, so there's no need for consumers to pass this option in.
It will be removed in the future for simplicity.
