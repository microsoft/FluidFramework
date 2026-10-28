---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Remove deprecated TreeBranch and TreeBranchAlpha type aliases

The deprecated `TreeBranch` and `TreeBranchAlpha` compatibility aliases have been removed. Use [`UntypedTreeView`](https://fluidframework.com/docs/api/tree/untypedtreeview-interface) and [`UntypedTreeViewAlpha`](https://fluidframework.com/docs/api/tree/untypedtreeviewalpha-interface) instead.

```typescript
// Before
import type { TreeBranch } from "fluid-framework/beta";
import type { TreeBranchAlpha } from "fluid-framework/alpha";

// After
import type { UntypedTreeView } from "fluid-framework/beta";
import type { UntypedTreeViewAlpha } from "fluid-framework/alpha";
```
