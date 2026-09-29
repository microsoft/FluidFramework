---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Add an alpha incremental-summary field property

The new alpha `summarizeIncrementally` property on [`FieldPropsAlpha`](https://fluidframework.com/docs/api/tree/fieldpropsalpha-interface) marks a field as an incremental-summary boundary without requiring direct use of allowed-types metadata or the [`incrementalSummaryHint`](https://fluidframework.com/docs/api/tree/#incrementalsummaryhint-variable) symbol.
This property is the preferred way to configure incremental summarization.
[`SchemaFactoryAlpha.requiredRecursive`](https://fluidframework.com/docs/api/tree/schemafactoryalpha-class#requiredrecursive-property) and [`optionalRecursive`](https://fluidframework.com/docs/api/tree/schemafactoryalpha-class#optionalrecursive-property) provide the same field configuration for recursive allowed types with relaxed compile-time constraints.
The [`SchemaFactoryAlpha.stagedOptional`](https://fluidframework.com/docs/api/tree/schemafactoryalpha-class#stagedoptional-property) and [`stagedOptionalRecursive`](https://fluidframework.com/docs/api/tree/schemafactoryalpha-class#stagedoptionalrecursive-property) field constructors also accept this option.

```typescript
const sf = new SchemaFactoryAlpha("example");

class Document extends sf.objectAlpha("Document", {
	sections: sf.required(sf.map(Section), { summarizeIncrementally: true }),
}) {}
```
