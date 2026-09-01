---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Expose schema incompatibility details on TreeViewBeta

`TreeViewBeta.discrepancies` now provides typed `SchemaDiscrepancy` objects when a view cannot access a tree because its view schema is incompatible with the stored schema.
The readonly array may include application-defined schema identifiers and field keys.
Each entry includes a `mismatch` discriminator so consumers can distinguish allowed-type, field-kind, value-schema, and node-kind differences.
Allowed-type discrepancies include staged types that are absent from the stored schema in `stagedView`, while discrepancies on staged optional fields include `viewIsStagedOptional: true`.
Staged-only differences remain compatible and do not produce discrepancies by themselves.

```typescript
if (!view.compatibility.canView) {
	const discrepancies = view.discrepancies;
	if (discrepancies !== undefined) {
		console.error(discrepancies);
	}
}
```
