---
"@fluidframework/aqueduct": minor
"@fluid-experimental/attributor": minor
"@fluidframework/container-runtime": minor
"@fluidframework/test-utils": minor
---
---
"section": legacy
---

The ContainerRuntime class has been removed

The `ContainerRuntime` class was [deprecated in version 2.12.0](https://github.com/microsoft/FluidFramework/releases/tag/client_v2.12.0#user-content-the-containerruntime-class-is-now-deprecated-23331) and has been removed.
Use `IContainerRuntime` to replace type usages and use the free function `loadContainerRuntime` to replace usages of the static method `ContainerRuntime.loadRuntime`.

See the [deprecation
announcement](https://github.com/microsoft/FluidFramework/releases/tag/client_v2.12.0#user-content-the-containerruntime-class-is-now-deprecated-23331)
for more details about how to update existing code.
