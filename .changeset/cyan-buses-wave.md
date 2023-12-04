---
"@fluidframework/shared-object-base": minor
"@fluid-experimental/tree": minor
"@fluid-experimental/tree2": minor
---

`FluidSerializer` more strictly validates `IFluidHandles`.

`FluidSerializer` now asserts on more objects that have an "IFluidHandle" member and are not `IFluidHandle`.
One example of this is if an object implements `IProvideFluidHandle`, but is not a `IFluidHandle`, it will now assert instead of silently trying to use the "IFluidHandle" member as an `IFluidHandle`.

One example of how this could be a problem is code which was passing in an `IDataStore` instead of a handle to it would silently have worked.
Such code should be fixed to use the `IDataStore.entryPoint` instead: not doing this will now assert.
