---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Add an incremental summary schema helper

`SchemaFactoryBeta.incrementalSummary` marks a field as an incremental-summary boundary without requiring direct use of allowed-types metadata or the `incrementalSummaryHint` symbol.
The helper accepts either a single allowed type or an array of allowed types while preserving exact read and insertable type inference.
`incrementalSummaryRecursive` supports recursive schema definitions that require relaxed compile-time constraints.

```typescript
const sf = new SchemaFactoryBeta("example");

class Document extends sf.object("Document", {
	sections: sf.incrementalSummary(sf.map(Section)),
}) {}
```
