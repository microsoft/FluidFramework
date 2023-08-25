---
"@fluidframework/container-runtime": minor
"@fluidframework/container-runtime-definitions": minor
"@fluidframework/runtime-definitions": minor
---

resolveHandle and IFluidHandleContext deprecated on ContainerRuntime

The `resolveHandle(...)` and `get IFluidHandleContext()` methods have been deprecated on the following classes/interfaces:

-   `IContainerRuntime`
-   `IContainerRuntimeBase`
-   `ContainerRuntime`

Please migrate all usage to using the `IContainerRuntime.request(...)` method if using a dynamic request URL, or to the `IContainerRuntime.getEntryPoint()` method if trying to obtain the application-specified root object.

**Note:** The `IContainerRuntime.request(...)` method will be deprecated in an upcoming release, so do not rely on this method for a long-term solution (the APIs around `entryPoint` and `getEntryPoint()` will become required and available for usage in its place).

Status on removal of the request pattern is tracked in [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md)
