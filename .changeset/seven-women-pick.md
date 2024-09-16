---
"fluid-framework": minor
"@fluidframework/tree": minor
---
---
"section": tree
---

Fix `.create` on structurally named MapNode schema

Constructing a structurally named MapNode schema (using the overload of `SchemaFactory.map` which does not take an explicit name), returned a `TreeNodeSchema` instead of a `TreeNodeSchemaNonClass`, which resulted in the create static method not being exposed.
This has been fixed, and can now be used as follows:

```typescript
const MyMap = schemaFactory.map(schemaFactory.number);
type MyMap = NodeFromSchema<typeof MyMap>;
const _fromMap: MyMap = MyMap.create(new MyMap());
const _fromIterable: MyMap = MyMap.create([]);
const _fromObject: MyMap = MyMap.create({});
```
