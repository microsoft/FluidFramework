---
"@fluidframework/aqueduct": major
"@fluidframework/container-definitions": major
"@fluidframework/container-loader": major
"@fluidframework/runtime-definitions": major
---

container-definitions: IContainer's and IDataStore's IFluidRouter capabilities are deprecated

`IFluidRouter` and `request({ url: "/" })` on `IContainer` and `IDataStore` are deprecated and will be removed in a future major release. Please migrate all usage to the appropriate `getEntryPoint()` or `entryPoint` APIs.

See [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md) for more details.
