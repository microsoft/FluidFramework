---
"@fluidframework/aqueduct": minor
"@fluid-experimental/attributor": minor
"@fluidframework/container-runtime": minor
"@fluidframework/test-utils": minor
---
---
"section": legacy
---

ContainerRuntime class is no longer exported

* Where used as a type, use `IContainerRuntime` instead
* Where used to call static method `ContainerRuntime.loadRuntime`, use the free function `loadContainerRuntime` instead

See the [deprecation release note](https://github.com/microsoft/FluidFramework/releases/tag/client_v2.12.0#user-content-the-containerruntime-class-is-now-deprecated-23331) for more details.
