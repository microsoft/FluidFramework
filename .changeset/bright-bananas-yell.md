---
"@fluidframework/core-interfaces": minor
"fluid-framework": minor
"@fluidframework/map": minor
"@fluidframework/tree": minor
"__section": feature
---
Add Fluid-controlled FluidMapLegacy, FluidReadonlyMap, and FluidMap interfaces to insulate against breaking changes in TypeScript's built-in Map types

Introduces `FluidMapLegacy`, `FluidReadonlyMap`, and `FluidMap` interfaces in `@fluidframework/core-interfaces` as, Fluid-controlled alternatives to TypeScript's built-in `Map` and `ReadonlyMap` types.
These interfaces use `IterableIterator` for iterator methods instead of the built-in `MapIterator`, which has changed across TypeScript versions (e.g., gaining `[Symbol.dispose]`), causing type incompatibilities for downstream consumers.

`FluidMapLegacy` is the `@public` mutable map interface, where `set` returns `this` for backward compatibility with existing interfaces like `IDirectory` and `ISharedMap`.
`FluidReadonlyMap` is an `@alpha` read-only subset derived from `FluidMapLegacy` via `Omit`.
`FluidMap` is an `@alpha` mutable map extending `FluidReadonlyMap`, where `set` returns `void` to avoid covariant `this` return type issues.

`IDirectory` and `ISharedMap` now extend `FluidMapLegacy` instead of the built-in `Map`, and `TreeIndex` now extends `FluidReadonlyMap` instead of the built-in `ReadonlyMap`.
This ensures that Fluid's public API surface is no longer coupled to the TypeScript standard library's map types, preventing future breakage when those types change.
