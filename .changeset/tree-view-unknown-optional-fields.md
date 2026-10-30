---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Add an alpha API to get the schema of unknown optional fields

The new `TreeContextAlpha.unknownOptionalFieldSchemas` property maps each object node schema that has [unknown optional fields](https://fluidframework.com/docs/api/fluid-framework/objectschemaoptions-interface#allowunknownoptionalfields-propertysignature) to the schema of those fields, keyed by stored key.
The value updates when the document's stored schema changes: listen to the view's `schemaChanged` event to know when to read it again.
It is available on `TreeViewAlpha` and on the context of any hydrated node.
It is `undefined` for unhydrated nodes, which have no view schema.

To read the content of these fields, use `TreeAlpha.exportVerbose` with `KeyEncodingOptions.allStoredKeys`.

```typescript
const sf = new SchemaFactoryBeta("com.example");
class Person extends sf.object(
	"Person",
	{ name: sf.string },
	{ allowUnknownOptionalFields: true },
) {}

// ...

// A newer version of the application added an optional `nickname` field.
const fieldSchemas = TreeAlpha.context(person).unknownOptionalFieldSchemas?.get(Person);
// Map { "nickname" => { kind: FieldKind.Optional, simpleAllowedTypes: Map { "com.fluidframework.leaf.string" => ... }, ... } }
```
