---
"@fluidframework/tree": minor
"@fluidframework/map": minor
"@fluidframework/container-loader": minor
"@fluid-internal/presence-definitions": minor
"@fluidframework/presence": minor
"fluid-framework": minor
"__section": breaking
---
Fluid container APIs use Fluid-owned container types

Fluid container APIs now use Fluid's own sealed container and iterator interfaces instead of TypeScript's built-in `ReadonlyArray`, `ReadonlyMap`, `Map`, `Iterator`, and `IterableIterator` types.
This insulates consumers from breaking changes in TypeScript's standard library that would otherwise propagate as unintended API breaks.

#### What changed

- `ReadonlyArrayNode` now extends `FluidReadonlyArray<T>` instead of `ReadonlyArray<T>`
- `TreeMapNode` now extends `FluidReadonlyMap` instead of `ReadonlyMap`
- `TreeArrayNode` and `TreeMapNode` iterator methods now return `FluidIterableIterator` instead of `IterableIterator`
- `TreeRecordNode[Symbol.iterator]` and `TreeRecordNodeUnsafe[Symbol.iterator]` now return `FluidIterableIterator`
- `IDirectory` and `ISharedMap` now extend `FluidMap` instead of `Map`
- `IDirectoryBeta` has been removed; use `IDirectory`, which now provides the Fluid-owned map contract
- `StateMap.keys()` now returns `FluidIterableIterator` instead of `IterableIterator`
- `PendingLocalStateStore` iteration methods now return `FluidIterableIterator` instead of built-in iterator types

#### Migration

The Fluid container types remain structurally assignable to their built-in counterparts when the configured TypeScript library does not require additional members, so most existing code continues to compile.
Code that relied on newer `Array` or `Map` methods available only through TypeScript's built-in types (such as `toReversed` or `toSorted`) will need to use workarounds:

```typescript
// Before (no longer compiles if using array methods not on FluidReadonlyArray)
const reversed = arrayNode.toReversed();

// After
const reversed = [...arrayNode].toReversed();
```

Assignments to compatible built-in container types continue to work:

```typescript
// Still works — FluidReadonlyArray is assignable to readonly T[]
const arr: readonly string[] = myArrayNode;
```
