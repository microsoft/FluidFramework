---
"@fluid-experimental/tree": minor
"__section": legacy
---
Add an interface for the experimental tree

The package exports `ISharedTree` for instance annotations. Existing `SharedTree` class exports, factory results, and helper signatures remain unchanged. The interface retains the inherited handle type in this preparation release.

```typescript
import { SharedTree, type ISharedTree } from "@fluid-experimental/tree";

const tree: ISharedTree = SharedTree.create(runtime);
```

This addition prepares consumers for the replacement of the implementation class.
It does not remove APIs or change persisted data formats.
See [issue #26691](https://github.com/microsoft/FluidFramework/issues/26691) for more details.
