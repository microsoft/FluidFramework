---
"@fluidframework/container-definitions": major
"@fluidframework/container-runtime": major
"@fluidframework/runtime-definitions": major
---

container-runtime: Removed request pattern from ContainerRuntime, IRuntime, and IContainerRuntimeBase

The `request(...)` method and `IFluidRouter` property have been removed from the following places:

-   `ContainerRuntime`
-   `IRuntime`
-   `IContainerRuntimeBase`

Please use the `IRuntime.getEntryPoint()` method to get the runtime's entry point.

See [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md) for more details.
