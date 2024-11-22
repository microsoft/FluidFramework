---
"fluid-framework": minor
"@fluidframework/tree": minor
---
---
"section": tree
---

Providing unused properties in object literals for building empty ObjectNodes no longer compiles

ObjectNodes with no fields will now emit a compiler error if constructed from an object literal with fields.
This matches the behavior of non-empty ObjectNodes which already gave errors when unexpected properties were provided.

```typescript
class A extends schemaFactory.object("A", {}) {}
const a = new A({ thisDoesNotExist: 5 }); // This now errors.
```
