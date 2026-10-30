---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Add an alpha API to get the schema of unknown optional fields

The new `TreeContextAlpha.unknownOptionalFieldSchemas` property maps each object node schema that has [unknown optional fields](https://fluidframework.com/docs/api/fluid-framework/objectschemaoptions-interface#allowunknownoptionalfields-propertysignature) to the schema of those fields, keyed by stored key.
The value updates when the document's stored schema changes: listen to the view's [`schemaChanged`](https://fluidframework.com/docs/api/fluid-framework/treeviewevents-interface#schemachanged-methodsignature) event to know when to read it again.
It is available on [`TreeViewAlpha`](https://fluidframework.com/docs/api/fluid-framework/treeviewalpha-interface) and on the [context](https://fluidframework.com/docs/api/fluid-framework/treealpha-interface#context-methodsignature) of any hydrated node.
It is `undefined` for [unhydrated](https://fluidframework.com/docs/api/fluid-framework/unhydrated-typealias) nodes, which have no view schema.

To read the content of these fields, use [`TreeAlpha.exportVerbose`](https://fluidframework.com/docs/api/fluid-framework/treealpha-interface#exportverbose-methodsignature) with [`KeyEncodingOptions.allStoredKeys`](https://fluidframework.com/docs/api/fluid-framework/keyencodingoptions-enum#allstoredkeys-enummember).

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
