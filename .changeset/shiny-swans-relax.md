---
"fluid-framework": minor
"@fluidframework/tree": minor
---
---
"section": tree
---

Improve typing when exact TypeScript type for a schema is not provided

The Tree APIs are designed to be used in a strongly typed way, with the full TypeScript type for the schema always being provided.
Due to limitations of the TypeScript language, there was not a practical way to prevent less descriptive types, like `TreeNodeSchema` or `ImplicitFieldSchema` from being used where the type of a specific schema was intended.
Code which does this will encounter several issues with tree APIs, and this change fixes some of those issues.
This change  mainly fixes that `NodeFromSchema<TreeNodeSchema>` used to return `unknown` and now returns `TreeNode | TreeLeafValue`.

This change by itself seems mostly harmless, as it just improves the precision of the typing in this one edge case.
Unfortunately there are other typing bugs which complicate the situation, resulting in APIs for inserting data into the tree to also behave poorly when given non-specific types like `TreeNodeSchema`.
These APIs include cases like `TreeView.initialize`.

This incorrectly allowed some usage like taking a type erased schema and initial tree pair, and creating a view of type `TreeView<ImplicitFieldSchema>` then initializing a it.
With the typing being partly fixed, some unsafe inputs are still allowed when trying to initialize such a view, but some are now prevented.

While this use-case of modifying in code not strongly typed by the exact schema, was not intended to be supported,
it did mostly work, and has some real use-cases (like tests looping over test data pairs of schema and tree data).
To help mitigate the impact of this change, some experimental `@alpha` APis have been introduced.

Before this change:

```typescript
import { TinyliciousClient } from "@fluidframework/tinylicious-client";
import {
	SchemaFactory,
	SharedTree,
	TreeViewConfiguration,
	type TreeNodeSchema,
} from "fluid-framework";

// Create a ITree instance
const tinyliciousClient = new TinyliciousClient();
const { container } = await tinyliciousClient.createContainer({ initialObjects: {} }, "2");
const tree = await container.create(SharedTree);

const schemaFactory = new SchemaFactory("demo");

// Bad: This loses the schema aware type information. `: TreeNodeSchema` should be omitted to preserve strong typing.
const schema: TreeNodeSchema = schemaFactory.array(schemaFactory.number);
const config = new TreeViewConfiguration({ schema });

// This view is types as `TreeView<TreeNodeSchema>`, which does not work well since its missing the actual schema type information.
const view = tree.viewWith(config);
// Root is typed as `unknown` allowing invalid assignment operations.
view.root = "invalid";
view.root = {};
// Since all assignments are allowed, valid ones still work:
view.root = [];
```

After this change:


```typescript
// Root is now typed as `TreeNode | TreeLeafValue`, still allowing some invalid assignment operations.
// In the future this should be prevented as well, since the type of the setter in this case should ne `never`
view.root = "invalid";
// This no longer compiles:
view.root = {};
// This also longer compiles:
view.root = [];
```

For code which wants to continue using a unsafe API which can result in runtime errors if the data does not follow the schema, a new alternative has been added to address this use-case. A special type `UnsafeUnknownSchema` can no be used to opt into allowing all valid trees to be provided.
Note that this leaves ensuring the data is in schema up to the user.
For now these adjusted APIs can be accessed by casting the view to `TreeViewAlpha<UnsafeUnknownSchema>`.
If stabilized this option wil be added to `TreeView` directly.

```typescript
const viewAlpha = view as TreeViewAlpha<UnsafeUnknownSchema>;
viewAlpha.initialize([]);
viewAlpha.root = [];
```
