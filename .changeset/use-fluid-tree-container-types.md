---
"@fluidframework/tree": minor
"__section": breaking
---
Tree containers use Fluid-owned collection types

[`ReadonlyArrayNode`](https://fluidframework.com/docs/api/tree/readonlyarraynode-interface), [`TreeMapNode`](https://fluidframework.com/docs/api/tree/treemapnode-interface), and [`TreeRecordNode`](https://fluidframework.com/docs/api/tree/treerecordnode-interface) now use [`FluidReadonlyArray`](https://fluidframework.com/docs/api/core-interfaces/fluidreadonlyarray-interface), [`FluidReadonlyMap`](https://fluidframework.com/docs/api/core-interfaces/fluidreadonlymap-interface), and [`FluidIterableIterator`](https://fluidframework.com/docs/api/core-interfaces/fluiditerableiterator-interface) instead of TypeScript's built-in collection and iterator types.
This prevents changes to TypeScript's standard library from introducing unintended requirements for Tree implementations.

#### Migration

Most existing assignments remain structurally compatible.
Methods available only on newer built-in collection types, such as `toReversed` and `toSorted`, are not available on Tree containers.
