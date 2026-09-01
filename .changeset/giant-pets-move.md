---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Expose schema incompatibility details on TreeView

`TreeView.compatibility.discrepancies` now provides the formatted schema discrepancies when a view cannot access a tree because its view schema is incompatible with the stored schema.
The value is a JSON-serialized array and may include application-defined schema identifiers and field keys.

```typescript
if (!view.compatibility.canView) {
	const details = view.compatibility.discrepancies;
	if (details !== undefined) {
		console.error(JSON.parse(details));
	}
}
```
