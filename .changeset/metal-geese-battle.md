---
"@fluid-experimental/attributor": major
"@fluidframework/container-runtime": major
---

container-runtime: Removed `ContainerRuntime.load(...)`

The static method `ContainerRuntime.load(...)` has been removed. Please migrate all usage of this method to
`ContainerRuntime.loadRuntime(...)`.
