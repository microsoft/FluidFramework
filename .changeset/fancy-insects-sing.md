---
"@fluidframework/container-runtime": minor
---
---
"section": deprecation
---

IContainerRuntimeOptions.flushMode is now deprecated

The `IContainerRuntimeOptions.flushMode` property is deprecated and will be removed in version 2.20.0. 

Only the default value `FlushMode.TurnBased` is supported when calling `ContainerRuntime.loadRuntime` directly, so there's no need for consumers to pass this option in.
