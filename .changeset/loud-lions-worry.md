---
"@fluidframework/container-runtime": major
---

container-runtime: initializeEntryPoint renamed to provideEntryPoint

The naming of `initializeEntryPoint` has been changed to `provideEntryPoint`. Please change the property name in relevant calls to `ContainerRuntime.loadRuntime(...)`.
