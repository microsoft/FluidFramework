---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Add an alpha incremental-summary field property

The new alpha `FieldPropsAlpha.summarizeIncrementally` property marks a field as an incremental-summary boundary without requiring direct use of allowed-types metadata or the `incrementalSummaryHint` symbol.
This property is the preferred way to configure incremental summarization.
`SchemaFactoryAlpha.requiredRecursive` and `optionalRecursive` provide the same field configuration for recursive allowed types with relaxed compile-time constraints.
The `SchemaFactoryAlpha.stagedOptional` and `stagedOptionalRecursive` field constructors also accept this option.

```typescript
const sf = new SchemaFactoryAlpha("example");

class Document extends sf.objectAlpha("Document", {
	sections: sf.required(sf.map(Section), { summarizeIncrementally: true }),
}) {}
```
