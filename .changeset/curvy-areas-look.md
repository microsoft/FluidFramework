---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Rename TreeBranch and TreeBranchAlpha to UntypedTreeView

`UntypedTreeView` and `UntypedTreeViewAlpha` replace the beta `TreeBranch` and alpha `TreeBranchAlpha` interfaces, clarifying that they represent tree views without known schemas. The old names remain available as deprecated compatibility aliases and will be removed in a future release.

Update API imports and type annotations to use the new names:

```typescript
// Before
import type { TreeBranch } from "fluid-framework/beta";
import type { TreeBranchAlpha } from "fluid-framework/alpha";
const betaBranch: TreeBranch = betaView.fork();
const alphaBranch: TreeBranchAlpha = alphaView.fork();

// After
import type { UntypedTreeView } from "fluid-framework/beta";
import type { UntypedTreeViewAlpha } from "fluid-framework/alpha";
const betaForkedView: UntypedTreeView = betaView.fork();
const alphaForkedView: UntypedTreeViewAlpha = alphaView.fork();
```
