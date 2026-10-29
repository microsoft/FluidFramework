---
"@fluid-experimental/tree": minor
"__section": legacy
---
Add an interface for the experimental tree

The package exports `createSharedTree` and `ISharedTree` so application code can create and use a tree without the implementation class.
The new function uses the factory registered with the data store runtime, so it preserves the configured write format and options.
Existing `SharedTree` class exports, factory results, and helper signatures remain unchanged.
The interface retains the inherited handle type and exposes the existing connection state and lifecycle methods.

```typescript
import { createSharedTree } from "@fluid-experimental/tree";

const tree = createSharedTree(runtime);
```

This addition prepares consumers for the replacement of the implementation class.
It does not remove APIs or change persisted data formats.
See [issue #26691](https://github.com/microsoft/FluidFramework/issues/26691) for more details.
