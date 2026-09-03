---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Expose schema incompatibility details on TreeViewBeta

`TreeViewBeta.compatibility.discrepancies` now provides typed `SchemaDiscrepancy` objects when a view cannot access a tree because its view schema is incompatible with the stored schema.
The readonly array may include application-defined schema identifiers and field keys.
Each entry includes a `mismatch` discriminator so consumers can distinguish allowed-type, field-kind, value-schema, and node-kind differences.
Allowed-type discrepancies include staged types that are absent from the stored schema in `stagedView`, while discrepancies on staged optional fields include `viewIsStagedOptional: true`.
Staged-only differences remain compatible and do not produce discrepancies by themselves.

```typescript
const sf = new SchemaFactory("com.example");
class Todo extends sf.object("Todo", {
	title: sf.number,
}) {}

const view = asBeta(tree.viewWith(new TreeViewConfiguration({ schema: Todo })));
if (!view.compatibility.canView) {
	console.error(view.compatibility.discrepancies);
}
```

If the stored schema allows `string` for `Todo.title`, the output is:

```json
[
	{
		"mismatch": "allowedTypes",
		"location": { "nodeType": "com.example.Todo", "fieldKey": "title" },
		"view": ["com.fluidframework.leaf.number"],
		"stored": ["com.fluidframework.leaf.string"]
	}
]
```

Applications can see from `mismatch: "allowedTypes"` that the schemas differ in their allowed types, compare `view` with `stored` to determine which types each schema permits, and use `location` to find the field where the mismatch occurs.
