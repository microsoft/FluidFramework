---
"@fluidframework/tree": minor
"__section": breaking
---
Tree containers use Fluid-owned collection types

Tree array, map, and record APIs now use Fluid-owned collection and iterator interfaces instead of TypeScript's built-in `ReadonlyArray`, `ReadonlyMap`, and `IterableIterator` types.
This prevents changes to TypeScript's standard library from introducing unintended requirements for Tree implementations.

#### Migration

Most existing assignments remain structurally compatible.
Methods available only on newer built-in collection types, such as `toReversed` and `toSorted`, are not available on Tree containers.
