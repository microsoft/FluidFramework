# Incremental Summary

Incremental summary is an optimization where parts of the tree that don't change across summaries are not re-summarized. The types in a schema can be opted into incremental summarization by marking them with `incrementalSummaryHint`. These types are tracked as independent chunk in the summary and during summarization, if their content hasn't changed since the last summary, they are re-used from the last summary. So, their data doesn't need to be re-encoded (saving processing time) and their summary tree doesn't need to be uploaded (reducing summary upload size).

> **Warning:** This is an alpha API and is actively under development. Interfaces and behavior may change in future releases without notice. Do not rely on it in production.

## Requirements

All five of the following must be set for incremental summary to take effect:

| Requirement | Value |
|---|---|
| Forest type | [`ForestTypeOptimized`](./src/shared-tree/sharedTree.ts) |
| Compression strategy | [`TreeCompressionStrategy.CompressedIncremental`](./src/feature-libraries/treeCompressionUtils.ts) |
| [`shouldEncodeIncrementally`](./src/shared-tree/sharedTree.ts) option | result of [`incrementalEncodingPolicyForAllowedTypes(config)`](./src/simple-tree/api/incrementalAllowedTypes.ts) |
| `minVersionForCollab` | [`FluidClientVersion.v2_74`](./src/codec/codec.ts) or higher |
| Schema opt-in | Fields marked with [`incrementalSummaryHint`](./src/simple-tree/api/incrementalAllowedTypes.ts) |

## How to Enable

### 1. Mark fields in your schema

Use `sf.types(...)` with `incrementalSummaryHint` in the `custom` metadata to opt a field in.

```typescript
import { SchemaFactoryAlpha, incrementalSummaryHint } from "@fluidframework/tree/alpha";

const sf = new SchemaFactoryAlpha("my-app");

class Item extends sf.objectAlpha("Item", {
    id: sf.number,
    // This field will be incrementally summarized.
    payload: sf.types([{ type: sf.string, metadata: {} }], {
        custom: { [incrementalSummaryHint]: true },
    }),
}) {}

class ItemList extends sf.arrayAlpha(
    "ItemList",
    // Each element of this array will be tracked as a separate incremental chunk.
    sf.types([{ type: Item, metadata: {} }], {
        custom: { [incrementalSummaryHint]: true },
    }),
) {}

class Root extends sf.objectAlpha("Root", {
    items: ItemList,
}) {}
```

> **Note:** Leaf nodes (string, number, boolean, null) are not incrementally summarized even when marked with `incrementalSummaryHint`.

### 2. Configure the SharedTree

Pass all four required options when creating the SharedTree:

```typescript
import {
    ForestTypeOptimized,
    TreeCompressionStrategy,
    TreeViewConfigurationAlpha,
} from "@fluidframework/tree/alpha";
import { incrementalEncodingPolicyForAllowedTypes } from "@fluidframework/tree/alpha";
import { FluidClientVersion } from "@fluidframework/tree/internal";

const config = new TreeViewConfigurationAlpha({ schema: Root });

const sharedTree = SharedTree.create(runtime, "tree", {
    forest: ForestTypeOptimized,
    treeEncodeType: TreeCompressionStrategy.CompressedIncremental,
    shouldEncodeIncrementally: incrementalEncodingPolicyForAllowedTypes(config),
    minVersionForCollab: FluidClientVersion.v2_74,
});
```

## How `incrementalEncodingPolicyForAllowedTypes` Works

`incrementalEncodingPolicyForAllowedTypes` takes a `TreeSchema` (typically a `TreeViewConfiguration`) and returns an `IncrementalEncodingPolicy` callback. During summarization, the callback is invoked for each field in the tree with the node identifier and field key. It returns `true` if the field was opted in via `incrementalSummaryHint`, directing the summarizer to encode that field as a separate, reusable chunk.

Fields that are _not_ opted in are encoded into the main summary blob as usual.

## Limitations and future work

- Root fields cannot be incrementally summarized (the callback always returns `false` for them).
- If the view schema doesn't recognize a node type (e.g., due to schema mismatch or unknown optional fields), that node falls back to non-incremental encoding.
- This feature is `@alpha` and the `incrementalSummaryHint` symbol will be replaced by a dedicated metadata property once the APIs stabilize.
