---
"@fluidframework/container-loader": minor
"__section": feature
---
Capture reusable container state

The new `ContainerAlpha.serializeAttached` method makes capturing an attached container's state more convenient.
For attached containers, callers explicitly choose whether to include unsequenced local changes.
With `includePendingLocalState: false`, `serializeAttached` omits local changes and session-specific state and the returned state can safely be used to load multiple containers connected to the original document.
`includePendingLocalState: true` has the same behavior and restrictions as `getPendingLocalState`: close the source container before loading the state, never load the same state more than once, and replace stored state after each reconnect.

```typescript
import { asLegacyAlpha } from "@fluidframework/container-loader/legacy/alpha";

const containerAlpha = asLegacyAlpha(container);
const state = await containerAlpha.serializeAttached({ includePendingLocalState: false });
// Safe: reuse the serialized state for multiple instances of the same document.
const first = await loader.resolve(request, state);
const second = await loader.resolve(request, state);
```

For detached or attaching containers, continue to use the existing `serialize()` method.
Serialization while attaching is not supported by `serializeAttached`.
