# @fluid-internal/presence-definitions

## 3.0.0

### Minor Changes

- Presence maps use Fluid-owned iterator types ([#27908](https://github.com/microsoft/FluidFramework/pull/27908)) [5035f7cfed4](https://github.com/microsoft/FluidFramework/commit/5035f7cfed4dedec8ded17b29be97f91f2a4b675)

  [`StateMap.keys()`](https://fluidframework.com/docs/api/presence/statemap-interface) now returns [`FluidIterableIterator`](https://fluidframework.com/docs/api/core-interfaces/fluiditerableiterator-interface) instead of TypeScript's built-in `IterableIterator`.
  This keeps the Presence API independent of additions to TypeScript's standard iterator interfaces.

  #### Migration

  The returned iterator continues to support `next()`, spreading, and `for...of`.
  Methods available only on newer built-in iterator types are not available.

  ```typescript
  for (const key of stateMap.keys()) {
    // ...
  }
  ```

## 2.116.0

Dependency updates only.

## 2.115.0

Dependency updates only.

## 2.114.0

Dependency updates only.

## 2.113.0

Dependency updates only.

## 2.112.0

Dependency updates only.

## 2.111.0

Dependency updates only.

## 2.110.0

Dependency updates only.

## 2.103.0

Dependency updates only.

## 2.102.0

Dependency updates only.

## 2.101.0

Dependency updates only.

## 2.100.0

### Minor Changes

- Node 22 is now the minimum supported Node.js version ([#27116](https://github.com/microsoft/FluidFramework/pull/27116)) [e8214d29663](https://github.com/microsoft/FluidFramework/commit/e8214d29663f5ee98d737daed82506a25d8de8d0)

  All Fluid Framework client packages now require Node.js 22 or later. This aligns with the standing Node upgrade policy as Node 20 reaches end-of-life on April 30, 2026.

## 2.93.0
