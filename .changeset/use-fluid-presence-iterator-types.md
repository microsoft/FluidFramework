---
"@fluid-internal/presence-definitions": minor
"@fluidframework/presence": minor
"__section": breaking
---
Presence maps use Fluid-owned iterator types

`StateMap.keys()` now returns `FluidIterableIterator` instead of TypeScript's built-in `IterableIterator`.
This keeps the Presence API independent of additions to TypeScript's standard iterator interfaces.

#### Migration

The returned iterator continues to support `next()`, spreading, and `for...of`.
Methods available only on newer built-in iterator types are not available.
