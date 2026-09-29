---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Add field-level options to existing field constructors

`SchemaFactoryBeta.required` and `SchemaFactoryBeta.optional` now accept field-level options.
Passing allowed types directly in an object schema remains supported as shorthand for a required field without additional options.
The initial alpha field option, `FieldOptionsAlpha.incrementalSummary`, marks the field as an incremental-summary boundary without requiring direct use of allowed-types metadata or the `incrementalSummaryHint` symbol.
This option is the preferred way to configure incremental summarization.
When used with existing allowed-types custom metadata, that metadata must be a plain object so the incremental-summary configuration can be added without discarding user metadata.
`SchemaFactoryAlpha.requiredRecursive` and `optionalRecursive` provide the same field configuration for recursive allowed types with relaxed compile-time constraints.
The `SchemaFactoryAlpha.stagedOptional` and `stagedOptionalRecursive` field constructors also accept this option.

```typescript
const sf = new SchemaFactoryAlpha("example");

class Document extends sf.objectAlpha("Document", {
	sections: sf.required(sf.map(Section), { incrementalSummary: true }),
}) {}
```
