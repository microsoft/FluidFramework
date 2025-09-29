---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Add configuredSharedTreeBeta

A limited subset of the options from the existing `@alpha` [`configuredSharedTree`](https://fluidframework.com/docs/api/fluid-framework#configuredsharedtree-function) API have been stabilized to `@beta` in the form of `configuredSharedTreeBeta`.

```typescript
import {
	configuredSharedTreeBeta,
	ForestTypeExpensiveDebug,
} from "fluid-framework/beta";
const SharedTree = configuredSharedTreeBeta({
	forest: ForestTypeExpensiveDebug,
});
```
