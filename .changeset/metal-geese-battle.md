---
"@fluid-experimental/attributor": major
"@fluidframework/container-runtime": major
---

Remove `ContainerRuntime.load(...)`

The static method `ContainerRuntime.load(...)` has been removed. Please migrate all usage of this method to `ContainerRuntime.loadRuntime(...)`.
