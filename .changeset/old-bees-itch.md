---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
comparePersistedSchema (alpha) has had its canInitialize parameter removed

[comparePersistedSchema](https://fluidframework.com/docs/api/tree/#comparepersistedschema-function) has had its `canInitialize` parameter removed.
This parameter was only used to add to the output [SchemaCompatibilityStatus](https://fluidframework.com/docs/api/fluid-framework/schemacompatibilitystatus-interface).
If a full `SchemaCompatibilityStatus` is still desired, the `canInitialize` value can be added to the result:

```typescript
// old
const result = comparePersistedSchema(a, b, canInitialize);
// new
const result = {...comparePersistedSchema(a, b), canInitialize};
```
