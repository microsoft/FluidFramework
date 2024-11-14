---
"fluid-framework": minor
"@fluidframework/tree": minor
---
---
"section": tree
---

Add `ObjectNodeSchema` type and `instanceof` for it.

[`SchemaFactory.object`](https://fluidframework.com/docs/api/v2/tree/schemafactory-class#object-method) now returns an `ObjectNodeSchema` which exposes a `.fields` property contains a map from its property names to its [`FieldSchema`](https://fluidframework.com/docs/api/v2/tree/fieldschema-class).

Additionally `schema instanceof ObjectNodeSchema` can be used to narrow a `TreeNodeSchema` to an `ObjectNodeSchema`.
