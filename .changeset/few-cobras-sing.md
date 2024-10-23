---
"fluid-framework": minor
"@fluidframework/tree": minor
---
---
"section": tree
---

Add `.schema` member to alpha enum schema APIs

The return value from `@alpha` APIs `enumFromStrings` and `adaptEnum` now has a property named `schema` which can be used to include it in a parent schema.
This replaces the use of `typedObjectValues` which has been removed.

Use of these APIs now look like:

```typescript
const schemaFactory = new SchemaFactory("com.myApp");
const Mode = enumFromStrings(schemaFactory, ["Fun", "Cool"]);
type Mode = NodeFromSchema<(typeof Mode.schema)[number]>;
class Parent extends schemaFactory.object("Parent", { mode: Mode.schema }) {}
```
