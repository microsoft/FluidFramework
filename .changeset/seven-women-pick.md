---
"fluid-framework": minor
"@fluidframework/tree": minor
---
---
"section": tree
---

Fix `.create` on structurally named MapNode and ArrayNode schema

Constructing a structurally named MapNode or ArrayNode schema (using the overload of `SchemaFactory.map` or `SchemaFactory.array` which does not take an explicit name), returned a `TreeNodeSchema` instead of a `TreeNodeSchemaNonClass`, which resulted in the `create` static method not being exposed.
This has been fixed, and can now be used as follows:

```typescript
const MyMap = schemaFactory.map(schemaFactory.number);
type MyMap = NodeFromSchema<typeof MyMap>;
const _fromMap: MyMap = MyMap.create(new MyMap());
const _fromIterable: MyMap = MyMap.create([]);
const _fromObject: MyMap = MyMap.create({});
```

This change causes some types to reference `TreeNodeSchemaNonClass` which did not reference it before.
While `TreeNodeSchemaNonClass` is `@system` (See [releases-and-apitags](https://fluidframework.com/docs/build/releases-and-apitags/) for details) and thus not intended to be referred to by users of Fluid,
this change caused the TypeScript compiler to generate references to it in more cases when compiling `d.ts` files.
Since the TypeScript compiler is unable to generate references to `TreeNodeSchemaNonClass` with how it was nested in `internalTypes.js`,
this change could break the build of packages exporting types referencing structurally named map and array schema.
This has been mitigated by moving `TreeNodeSchemaNonClass` out of `internalTypes.js`:
any code importing `TreeNodeSchemaNonClass` (and thus disregarding the `@system` restriction) can be fixed by importing it from the top level instead of the `internalTypes.js`
