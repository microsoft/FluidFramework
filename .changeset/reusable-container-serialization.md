---
"@fluidframework/container-loader": minor
"__section": feature
---
Capture reusable container state

The new `ContainerAlpha.serializeV2` method unifies and makes several existing methods Fluid has for capturing an existing container's state more convenient.
For attached containers, callers explicitly choose whether to include unsequenced local changes.
With `includeLocalChanges: false`, the result omits local changes and session-specific state and can safely load multiple independent containers for the same document.
`includeLocalChanges: true` has the same behavior and restrictions as `getPendingLocalState`: close the source container before loading the state, never load the same state more than once, and replace stored state after each reconnect.

```typescript
import { asLegacyAlpha } from "@fluidframework/container-loader/legacy/alpha";

const containerAlpha = asLegacyAlpha(container);
const state = await containerAlpha.serializeV2({ includeLocalChanges: false });
// Safe: reuse the serialized state for multiple instances of the same document.
const first = await loader.resolve(request, state);
const second = await loader.resolve(request, state);
```

For detached containers, either value of `includeLocalChanges` captures the full current draft, just like `serialize()`.
Use `rehydrateDetachedContainer` or `loader.rehydrateDetachedContainerFromSnapshot` to create a detached container from this state.
It is safe to use the same serialized state to create multiple detached containers.

Serialization while attaching is not currently supported by `serializeV2`.
