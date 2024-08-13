---
"fluid-framework": minor
"@fluidframework/tree": minor
---
---
section: tree
---

Add `ITreeConfigurationOptions.preventAmbiguity`

The new `ITreeConfigurationOptions.preventAmbiguity` flag can be set to true to enable checking of some additional rules when constructing the `TreeViewConfiguration`.

This example shows an ambiguous schema:

```typescript
const schemaFactory = new SchemaFactory("com.example");
class Feet extends schemaFactory.object("Feet", { length: schemaFactory.number }) {}
class Meters extends schemaFactory.object("Meters", { length: schemaFactory.number }) {}
const config = new TreeViewConfiguration({
	// This combination of schema can lead to ambiguous cases, and will error since preventAmbiguity is true.
	schema: [Feet, Meters],
	preventAmbiguity: true,
});
const view = tree.viewWith(config);
// This is invalid since it is ambiguous which type of node is being constructed.
// The error thrown above when constructing the TreeViewConfiguration is because of this ambiguous case:
view.initialize({ length: 5 });
```

See the documentation on `ITreeConfigurationOptions.preventAmbiguity` for a more complete example and more details.
