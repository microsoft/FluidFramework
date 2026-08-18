---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Rename TreeBranchAlpha to UntypedTreeViewAlpha

`UntypedTreeViewAlpha` is now the preferred name for the alpha `TreeBranchAlpha` interface, clarifying that it represents a tree view without a known schema. `TreeBranchAlpha` remains available as a deprecated alias for compatibility and will be removed in a future release.

Update alpha API imports and type annotations to use the new name:

```typescript
// Before
import type { TreeBranchAlpha } from "fluid-framework/alpha";
const branch: TreeBranchAlpha = view.fork();

// After
import type { UntypedTreeViewAlpha } from "fluid-framework/alpha";
const forkedView: UntypedTreeViewAlpha = view.fork();
```
