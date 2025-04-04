---
"fluid-framework": minor
"@fluidframework/tree": minor
---
---
"section": feature
---

Provide access to tree content and stored schema without requiring a compatible view schema

Adds `ITreeAlpha` (Which ITree can be down casted to) that exposes access to both the tree content and the schema.
This allows inspecting the content saved in a shared tree in a generic way that can work on any shared tree.

This can be combined with the existing `generateSchemaFromSimpleSchema` to generate a schema that can be used with [`IIree.viewWith`](https://fluidframework.com/docs/api/fluid-framework/viewabletree-interface#viewwith-methodsignature) to allow constructing a [`TreeView`](https://fluidframework.com/docs/api/fluid-framework/treeview-interface) for any shared tree, regardless of its schema.

Note that the resulting TypeScript typing for such a view will not be friendly: the TreeView APIs are designed for statically known schema. With care and a lot of type casts use is possible, but not recommended when avoidable: see declaimer on `generateSchemaFromSimpleSchema`.

Example using `ITreeAlpha` and `generateSchemaFromSimpleSchema`:

```typescript
const viewAlpha = tree as ITreeAlpha;
const treeSchema = generateSchemaFromSimpleSchema(viewAlpha.exportSimpleSchema());
const config = new TreeViewConfiguration({ schema: treeSchema.root });
const view = viewAlpha.viewWith(config);
```

`getSimpleSchema` is also added as an `@alpha` API to provide a way to clone schema into the simple schema formats.
Note that when using (or copying) a view schema as a simple schema, more metadata will be preserved than when deriving one from the stored schema using `ITreeAlpha`.
