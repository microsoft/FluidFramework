---
"@fluidframework/container-runtime": minor
---
---
"section": deprecation
---

Deprecating `IContainerRuntimeOptions.flushMode`

Only the default value `FlushMode.TurnBased` is supported when calling `ContainerRuntime.loadRuntime` directly,
so there's no need for consumers to pass this option in.  We'll remove the option altogether in `2.20.0`.
