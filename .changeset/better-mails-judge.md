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
