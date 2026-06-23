---
"@fluidframework/tree": minor
"__section": tree
---
Opt plain text into incremental summarization

The character content of a `TextAsTree.Tree` node is now opted in to incremental summarization: its schema carries the `incrementalSummaryHint` metadata.
When incremental summarization is enabled on the tree, character content that does not change between summaries is not re-encoded or re-uploaded to the service; instead the unchanged chunks are referenced by handle.
For large texts which are edited in only a few places at a time (a common pattern for collaborative documents), this can substantially reduce summary upload size and the CPU cost of producing each summary.

Because the schema already opts its content in, enabling the optimization only requires configuring the tree.

```typescript
import {
	configuredSharedTreeAlpha,
	ForestTypeOptimized,
	incrementalEncodingPolicyForAllowedTypes,
	TextAsTree,
	TreeCompressionStrategy,
	TreeViewConfigurationAlpha,
	FluidClientVersion,
} from "@fluidframework/tree/alpha";

const config = new TreeViewConfigurationAlpha({ schema: TextAsTree.Tree });

const SharedTreeWithIncrementalSummaries = configuredSharedTreeAlpha({
	forest: ForestTypeOptimized,
	treeEncodeType: TreeCompressionStrategy.CompressedIncremental,
	shouldEncodeIncrementally: incrementalEncodingPolicyForAllowedTypes(config),
	minVersionForCollab: FluidClientVersion.v2_74,
});

const sharedTree = haredTreeWithIncrementalSummaries.create(runtime, "tree");
```

See the [Incremental Summary documentation](https://github.com/microsoft/FluidFramework/blob/main/packages/dds/tree/INCREMENTAL_SUMMARY.md) for the full set of required options and details.
