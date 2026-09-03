---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Add an incremental summary schema helper

`SchemaFactoryAlpha.incrementalSummary` marks a field as an incremental-summary boundary without requiring direct use of allowed-types metadata or the `incrementalSummaryHint` symbol.
The helper accepts either a single allowed type or an array of allowed types while preserving exact read and insertable type inference.

```typescript
const sf = new SchemaFactoryAlpha("example");

class Document extends sf.objectAlpha("Document", {
	sections: sf.incrementalSummary(sf.map(Section)),
}) {}
```
