---
"@fluidframework/tree": minor
"@fluidframework/map": minor
"fluid-framework": minor
"__section": breaking
---
Replace built-in TypeScript container types with Fluid sealed interfaces in public APIs

Tree and map DDS interfaces now extend Fluid's own sealed container interfaces instead of TypeScript's built-in `ReadonlyArray`, `ReadonlyMap`, and `Map` types.
This insulates consumers from breaking changes in TypeScript's standard library that would otherwise propagate as unintended API breaks.

#### What changed

- `ReadonlyArrayNode` now extends `FluidReadonlyArray<T>` instead of `ReadonlyArray<T>`
- `TreeMapNode` now extends `FluidReadonlyMap` instead of `ReadonlyMap`
- `TreeArrayNode` and `TreeMapNode` iterator methods now return `FluidIterableIterator` instead of `IterableIterator`
- `TreeRecordNode[Symbol.iterator]` now returns `FluidIterableIterator`
- `IDirectory` and `ISharedMap` now extend `FluidMap` instead of `Map`

#### Migration

The Fluid container types are structurally assignable to their built-in counterparts, so most existing code continues to compile.
Code that relied on newer `Array` or `Map` methods available only through TypeScript's built-in types (such as `toReversed` or `toSorted`) will need to use workarounds:

```typescript
// Before (no longer compiles if using array methods not on FluidReadonlyArray)
const reversed = arrayNode.toReversed();

// After
const reversed = [...arrayNode].toReversed();
```

Variables explicitly typed as `ReadonlyArray`, `ReadonlyMap`, or `Map` continue to accept these nodes:

```typescript
// Still works — FluidReadonlyArray is assignable to readonly T[]
const arr: readonly string[] = myArrayNode;
```
