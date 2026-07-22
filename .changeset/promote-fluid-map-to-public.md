---
"@fluidframework/core-interfaces": minor
"fluid-framework": minor
"__section": core
---

Promote FluidIterable, FluidIterableIterator, FluidReadonlyMap, and FluidMap to @public

These sealed interfaces provide TypeScript-version-independent alternatives to the built-in `Iterable`, `IterableIterator`, `ReadonlyMap`, and `Map` types. They were previously `@beta` and are now promoted to `@public` so they can be used in public API surfaces.
