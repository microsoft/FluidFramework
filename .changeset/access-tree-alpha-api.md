---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
asAlpha now supports ITree

The `asAlpha` function now accepts an `ITree` and returns its `ITreeAlpha` API.

```typescript
import { asAlpha, type ITree } from "@fluidframework/tree/alpha";

declare const tree: ITree;
const alphaTree = asAlpha(tree);
```
