---
"@fluidframework/core-interfaces": minor
"fluid-framework": minor
"__section": feature
---
Add FluidReadonlyArray type independent of TypeScript lib

`FluidReadonlyArray<T>` provides an equivalent of the built-in `ReadonlyArray` type that is independent of TypeScript [`lib`](https://www.typescriptlang.org/tsconfig/#lib), following the same pattern as `FluidReadonlyMap` and `FluidMap`.
The interface includes stable methods through ES2023 (`at()`, `findLast()`, `findLastIndex()`) but excludes newer copy-on-write methods (`toReversed()`, `toSorted()`, `toSpliced()`, `with()`) that Fluid Framework implementations don't yet support.
This ensures these types remain safe to implement without `lib` changes breaking them.
