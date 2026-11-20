---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
New alpha `TreeAlpha.insertVerbose` and `TreeAlpha.setVerbose` APIs to insert verbose content directly into a tree

`TreeAlpha.insertVerbose(array, index, content)` inserts items in the [VerboseTree](https://fluidframework.com/docs/api/fluid-framework/verbosetree-typealias) format into an array node, and `TreeAlpha.setVerbose(parent, key, content)` sets an object property or a map or record entry to such content.

Inserting content created with `TreeAlpha.importVerbose` checks it against the schema twice and creates a `TreeNode` for every node of it.
These functions check the content once, against the stored schema of the destination tree, and build it directly into the tree's storage without creating nodes.
The edit, its events, and its behavior in transactions and when reverted are those of the equivalent `insertAt` or property assignment.

The content uses stored keys, as produced by `TreeAlpha.exportVerbose` with `KeyEncodingOptions.allStoredKeys`.
Identifier fields without content get new identifiers.
Since the content is only checked against the stored schema, checks which node constructors run from the view schema (for example, those of tables made by `TableSchema`) do not run.

```typescript
const data = TreeAlpha.exportVerbose(section, { keys: KeyEncodingOptions.allStoredKeys });
TreeAlpha.insertVerbose(view.root.sections, index, [data]);
```

Inserting each section of a synthetic 200-section document (about 640 nodes per section) took 9.3 to 10.0 ms with `importVerbose` and `insertAt`, and 1.2 ms with `insertVerbose`, with `ForestTypeOptimized`; with `ForestTypeReference`, 12.5 to 13.2 ms and 4.0 to 4.3 ms.
Measured in Node.js 22 with production asserts; results depend on the schema and workload.
