---
"@fluidframework/container-definitions": major
"@fluidframework/runtime-definitions": major
---

IContainer's and IDataStore's IFluidRouter capabilities are deprecated

While the `request` function taking an arbitrary URL and headers is deprecated, an overload taking only `{ url: '/' } is not,
for back-compat purposes during the migration from the request pattern to using entryPoint.

See [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md)
for more info on this effort.
