---
"@fluidframework/aqueduct": major
"@fluidframework/data-object-base": major
"@fluidframework/test-utils": major
---

data-object-base: Removed IFluidRouter from DataObject interfaces and classes

The `IFluidRouter` property has been removed from a number of DataObject related classes:

-   `PureDataObject`
-   `LazyLoadedDataObject`
-   `TestFluidObject`

Please migrate to the new `entryPoint` pattern or use the relevant `request` method as necessary.

See
[Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md)
for more details.
