# Incremental Summary

Incremental summary is an optimization that avoids re-summarizing parts of the tree that don't change between summaries. Fields in a schema can opt in to incremental summarization with `SchemaFactoryBeta.incrementalSummary`. These fields are tracked as independent chunks in the summary. During summarization, if their content hasn't changed since the last summary, their previously generated summaries are reused. As a result, their data doesn't need to be re-encoded (saving processing time), and their summary trees don't need to be uploaded again (reducing summary upload size).

> **Warning:** Incremental summary is a beta API and is actively under development. Interfaces and behavior may change in future releases without notice.

## Requirements

All five of the following must be set for incremental summary to take effect:

| Requirement | Value |
|---|---|
| Forest type | [`ForestTypeOptimized`](./src/shared-tree/sharedTree.ts) |
| Compression strategy | [`TreeCompressionStrategy.CompressedIncremental`](./src/feature-libraries/treeCompressionUtils.ts) |
| [`shouldEncodeIncrementally`](./src/shared-tree/sharedTree.ts) option | result of [`incrementalEncodingPolicyForAllowedTypes(config)`](./src/simple-tree/api/incrementalAllowedTypes.ts) |
| `minVersionForCollab` | [`FluidClientVersion.v2_74`](./src/codec/codec.ts) or higher |
| Schema opt-in | Fields marked with [`SchemaFactoryBeta.incrementalSummary`](./src/simple-tree/api/schemaFactoryBeta.ts) |

## How to Enable

### 1. Mark fields in your schema

Use `sf.incrementalSummary(...)` to opt a field in.
For recursive schema, use `sf.incrementalSummaryRecursive(...)` with an allowed-types array.

```typescript
import { SchemaFactoryBeta } from "@fluidframework/tree/beta";

const sf = new SchemaFactoryBeta("my-app");

class Item extends sf.object("Item", {
    id: sf.number,
    // This field will be incrementally summarized.
    payload: sf.incrementalSummary(sf.string),
}) {}

class ItemList extends sf.array(
    "ItemList",
    // Each element of this array will be tracked as a separate incremental chunk.
    sf.incrementalSummary(Item),
) {}

class Root extends sf.object("Root", {
    items: ItemList,
}) {}
```

> **Note:** Incremental summarization is applied to **fields**, not node kinds. Leaf values (string, number, boolean, null) can be incrementally summarized when they are stored in a field wrapped by `incrementalSummary` (for example, an object field whose allowed type is `string`). Root fields themselves cannot be incrementally summarized, and leaf node kinds do not expose child fields for the policy to apply to.

### 2. Configure the SharedTree

Pass all four required options when creating the SharedTree using `configuredSharedTreeAlpha`:

```typescript
import {
    configuredSharedTreeAlpha,
    ForestTypeOptimized,
    TreeCompressionStrategy,
    TreeViewConfigurationAlpha,
    incrementalEncodingPolicyForAllowedTypes,
    FluidClientVersion,
} from "@fluidframework/tree/alpha";

const config = new TreeViewConfigurationAlpha({ schema: Root });

const TreeFactory = configuredSharedTreeAlpha({
    forest: ForestTypeOptimized,
    treeEncodeType: TreeCompressionStrategy.CompressedIncremental,
    shouldEncodeIncrementally: incrementalEncodingPolicyForAllowedTypes(config),
    minVersionForCollab: FluidClientVersion.v2_74,
});

const sharedTree = TreeFactory.create(runtime, "tree");
```

## How `incrementalEncodingPolicyForAllowedTypes` Works

`incrementalEncodingPolicyForAllowedTypes` takes a `TreeSchema` (typically a `TreeViewConfiguration`) and returns an `IncrementalEncodingPolicy` callback. During summarization, the callback is invoked for each field in the tree with the node identifier and field key. It returns `true` if the field was opted in via `incrementalSummary`, directing the summarizer to encode that field as a separate, reusable chunk.

Fields that are _not_ opted in are encoded into the main summary blob as usual.

## Limitations and future work

- Root fields cannot be incrementally summarized (the callback always returns `false` for them).
- If the view schema doesn't recognize a node type (e.g., due to schema mismatch or unknown optional fields), that node falls back to non-incremental encoding.
- Incremental summary is `@beta` and may change as the APIs stabilize.
