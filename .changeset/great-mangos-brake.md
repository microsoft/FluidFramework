---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Add a configurable field-schema API

`SchemaFactoryBeta.field` explicitly creates a required field schema from a single allowed type or an allowed-types array and a set of field-level options.
Passing allowed types directly in an object schema remains supported as shorthand for a required field without additional options.
The initial field option, `incrementalSummary`, marks the field as an incremental-summary boundary without requiring direct use of allowed-types metadata or the `incrementalSummaryHint` symbol.
`fieldRecursive` provides the same field configuration for recursive allowed types with relaxed compile-time constraints.

```typescript
const sf = new SchemaFactoryBeta("example");

class Document extends sf.object("Document", {
	sections: sf.field(sf.map(Section), { incrementalSummary: true }),
}) {}
```
