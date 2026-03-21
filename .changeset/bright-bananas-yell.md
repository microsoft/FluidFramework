---
"@fluidframework/core-interfaces": minor
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": feature
---
Add Fluid-controlled map and iterator interfaces to insulate against breaking changes in TypeScript's built-in types

Introduces `FluidReadonlyMap`, `FluidMap`, `FluidIterable`, and `FluidIterableIterator` interfaces in `@fluidframework/core-interfaces` as Fluid-controlled alternatives to TypeScript's built-in `ReadonlyMap`, `Map`, `Iterable`, and `IterableIterator` types.
These exist so that Fluid has types which are safe to implement and cannot be broken by changes to TypeScript's default types. All behavior exposed through these interfaces should be compatible with the corresponding behavior of the built-in types, but they may lack some of the newer APIs.

`FluidReadonlyMap` is a `@public` read-only map interface.
`FluidMap` is a `@public` mutable map extending `FluidReadonlyMap`, where `set` returns `void` to avoid covariant `this` return type issues.

`TreeIndex` now extends `FluidReadonlyMap` instead of the built-in `ReadonlyMap`, and `TreeMapNode` now extends `FluidReadonlyMap` instead of the built-in `ReadonlyMap`.
This ensures that Fluid's public API surface is no longer coupled to the TypeScript standard library's map types, preventing future breakage when those types change.
