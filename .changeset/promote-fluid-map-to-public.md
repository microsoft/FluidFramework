---
"@fluidframework/core-interfaces": minor
"fluid-framework": minor
"__section": feature
---
Promote Fluid container type interfaces to public

`FluidIterable`, `FluidIterableIterator`, `FluidReadonlyMap`, `FluidMap`, and `FluidReadonlyArray` are promoted from `@beta` to `@public`.
These sealed interfaces provide equivalents of the built-in `Iterable`, `IterableIterator`, `ReadonlyMap`, `Map`, and `ReadonlyArray` types that are independent of TypeScript [`lib`](https://www.typescriptlang.org/tsconfig/#lib).
They can now be used in public API surfaces.
