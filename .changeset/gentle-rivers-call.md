---
"@fluidframework/container-runtime": major
"@fluidframework/container-runtime-definitions": major
"@fluidframework/runtime-definitions": major
---

DEPRECATED: resolveHandle and IFluidHandleContext deprecated on IContainerRuntime

The `resolveHandle(...)` and `get IFluidHandleContext()` methods have been deprecated on the following interfaces:

-   `IContainerRuntime`
-   `IContainerRuntimeBase`

Requesting arbitrary URLs has been deprecated on `IContainerRuntime`. Please migrate all usage to the `IContainerRuntime.getEntryPoint()` method if trying to obtain the application-specified root object.

See [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md) for more details.
