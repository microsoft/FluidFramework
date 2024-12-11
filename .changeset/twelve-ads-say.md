---
"@fluidframework/container-runtime": minor
---
---
"section": legacy
---

Removing `IContainerRuntimeOptions.flushMode`

Only the default value `FlushMode.TurnBased` is supported when calling `ContainerRuntime.loadRuntime` directly,
so there's no need for consumers to pass this option in.
