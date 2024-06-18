---
"@fluidframework/core-interfaces": minor
"fluid-framework": minor
"@fluidframework/tree": minor
---

Unify `IDisposable` interfaces.

Public APIs in `@fluidframework/tree` now use `IDisposable` from `@fluidframework/core-interfaces` replacing `disposeSymbol` with "dispose".

`IDisposable` in `@fluidframework/core-interfaces` is now `@sealed` indicating that third parties should not implement it to reserve the ability for Fluid Framework to extend it to include `Symbol.dispose` as a future non-breaking change.
