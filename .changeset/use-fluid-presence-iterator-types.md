---
"@fluid-internal/presence-definitions": minor
"@fluidframework/presence": minor
"__section": breaking
---
Presence maps use Fluid-owned iterator types

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
