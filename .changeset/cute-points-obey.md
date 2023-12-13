---
"@fluidframework/container-runtime-definitions": major
"@fluidframework/runtime-definitions": major
---

container-runtime-definitions: Removed resolveHandle and IFluidHandleContext from ContainerRuntime interfaces

The `IContainerRuntime.resolveHandle(...)` method and the `IContainerRuntimeBase.IFluidHandleContext` property have been
removed. Please remove all usage of these APIs.

See
[Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md)
for more details.
