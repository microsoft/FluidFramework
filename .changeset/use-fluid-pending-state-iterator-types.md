---
"@fluidframework/container-loader": minor
"__section": breaking
---
Pending local state uses Fluid-owned iterator types

[`PendingLocalStateStore`](https://fluidframework.com/docs/api/container-loader/pendinglocalstatestore-class) iteration methods now return [`FluidIterableIterator`](https://fluidframework.com/docs/api/core-interfaces/fluiditerableiterator-interface) instead of TypeScript's built-in iterator types.
This prevents changes to TypeScript's standard iterator interfaces from affecting the container loader API.

#### Migration

The returned iterators continue to support `next()`, spreading, and `for...of`.
Methods available only on newer built-in iterator types are not available.

```typescript
for (const [key, pendingState] of pendingLocalStateStore.entries()) {
	// ...
}
```
