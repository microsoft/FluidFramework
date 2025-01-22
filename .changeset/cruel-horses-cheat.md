---
"@fluidframework/container-runtime": minor
---
---
"section": legacy
---

The IContainerRuntimeOptions.flushMode property has been removed

The `IContainerRuntimeOptions.flushMode` property was [deprecated in version 2.12.0](https://github.com/microsoft/FluidFramework/releases/tag/client_v2.12.0#user-content-icontainerruntimeoptionsflushmode-is-now-deprecated-23288) and has been removed.

Only the default value, `FlushMode.TurnBased`, is supported when calling `ContainerRuntime.loadRuntime` directly,
so there's no need for consumers to pass this option in.
