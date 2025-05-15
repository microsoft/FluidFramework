---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": feature
---
Adds enablable allowed types to SchemaFactoryAlpha

This adds the `enablable` API to [`SchemaFactoryAlpha`](https://fluidframework.com/docs/api/fluid-framework/schemafactoryalpha-class). Enablables can be passed in as [`AllowedTypes`](https://fluidframework.com/docs/api/fluid-framework/allowedtypes-typealias) to declare that a type can be read at a particular location in the tree but not written there.

This example array schema permits loading strings from the document but does not permit writing strings to the tree:
```typescript
schemaFactoryAlpha.arrayAlpha("TestArray", [schemaFactoryAlpha.number, schemaFactoryAlpha.enablable(schemaFactoryAlpha.string)]);
```
