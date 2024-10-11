---
"fluid-framework": minor
"@fluidframework/tree": minor
---
---
"section": tree
highlight: true
---

✨ New! Add alpha API for providing SharedTree configuration options

A new alpha `configuredSharedTree` had been added.
This allows providing configuration options, primarily for debugging, testing and evaluation of upcoming features.
The resulting configured `SharedTree` object can then be used in-place of the regular `SharedTree` imported from `fluid-framework`.

```typescript
import {
	ForestType,
	TreeCompressionStrategy,
	configuredSharedTree,
	typeboxValidator,
} from "@fluid-framework/alpha";
// Maximum debuggability and validation enabled:
const SharedTree = configuredSharedTree({
	forest: ForestType.Expensive,
	jsonValidator: typeboxValidator,
	treeEncodeType: TreeCompressionStrategy.Uncompressed,
});
// Opts into the under development optimized tree storage planned to be the eventual default implementation:
const SharedTree = configuredSharedTree({
	forest: ForestType.Optimized,
});
```
