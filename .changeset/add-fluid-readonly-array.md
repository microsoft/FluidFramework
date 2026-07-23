---
"@fluidframework/core-interfaces": minor
"fluid-framework": minor
"__section": Add FluidReadonlyArray type
---

Add `FluidReadonlyArray<T>` interface to `@fluidframework/core-interfaces` and re-export from `fluid-framework`.

`FluidReadonlyArray<T>` provides a TypeScript-version-independent equivalent of the built-in `ReadonlyArray` type, following the same pattern as `FluidReadonlyMap` and `FluidMap`. The interface includes stable methods through ES2023 (`at()`, `findLast()`, `findLastIndex()`) but excludes newer copy-on-write methods (`toReversed()`, `toSorted()`, `toSpliced()`, `with()`) that Fluid Framework implementations don't yet support. This ensures these types remain safe to implement without TypeScript updates breaking them.
