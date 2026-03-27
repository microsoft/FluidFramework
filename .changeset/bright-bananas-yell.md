---
"@fluidframework/core-interfaces": minor
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": feature
---
Add Fluid-controlled map and iterator interfaces

Introduces `FluidReadonlyMap`, `FluidMap`, `FluidIterable`, and `FluidIterableIterator` interfaces as alpha APIs in `@fluidframework/core-interfaces`.
These exist so that Fluid has types which are safe to implement and cannot be broken by changes to TypeScript's default types. All behavior exposed through these interfaces should be compatible with the corresponding behavior of the built-in types, but they may lack some of the newer APIs.

New APIs looking to extend Map or ReadonlyMap should extend these interfaces instead.

`TreeIndex` now extends `FluidReadonlyMap` instead of the built-in `ReadonlyMap`, and `TreeMapNodeAlpha` which extends `FluidReadonlyMap` instead of the built-in `ReadonlyMap` has been added.
This works to uncouple Fluid's public API surface to the TypeScript standard library's map types, preventing future breakage when those types change.
