---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Add an alpha API to get the schema of unknown fields

The new `TreeContextAlpha.unknownFieldSchemas` property maps each object node schema that has [unknown fields](https://fluidframework.com/docs/api/fluid-framework/objectschemaoptions-interface#allowunknownoptionalfields-propertysignature) to the schema of those fields, keyed by stored key.
The value updates when the document's stored schema changes: listen to the view's [`schemaChanged`](https://fluidframework.com/docs/api/fluid-framework/treeviewevents-interface#schemachanged-methodsignature) event to know when to read it again.
It is available on [`TreeViewAlpha`](https://fluidframework.com/docs/api/fluid-framework/treeviewalpha-interface) and on the [context](https://fluidframework.com/docs/api/fluid-framework/treealpha-interface#context-methodsignature) of any hydrated node.
It is `undefined` for [unhydrated](https://fluidframework.com/docs/api/fluid-framework/unhydrated-typealias) nodes, which have no view schema.

To read the content of these fields, use [`TreeAlpha.exportVerbose`](https://fluidframework.com/docs/api/fluid-framework/treealpha-interface#exportverbose-methodsignature) with [`KeyEncodingOptions.allStoredKeys`](https://fluidframework.com/docs/api/fluid-framework/keyencodingoptions-enum#allstoredkeys-enummember).

#### Example

Version 1 of an application defines a `Person` with a `name` field, and allows unknown optional fields.
[`allowUnknownOptionalFields`](https://fluidframework.com/docs/api/fluid-framework/objectschemaoptions-interface#allowunknownoptionalfields-propertysignature) will be enabled by default in the 3.10 release.

```typescript
const sf = new SchemaFactoryBeta("com.example");
class Person extends sf.object(
	"Person",
	{ name: sf.string },
	{ allowUnknownOptionalFields: true },
) {}
```

Version 2 of the application adds an optional `nickname` field:

```typescript
class Person extends sf.object(
	"Person",
	{ name: sf.string, nickname: sf.optional(sf.string) },
	{ allowUnknownOptionalFields: true },
) {}
```

Version 1 can still open a document after version 2 upgrades its schema, but the `nickname` field is unknown to it.
Version 1 can use `unknownFieldSchemas` to find the schema of that field, then use `exportVerbose` to read its content:

```typescript
// In version 1 of the application:
const fieldSchemas = TreeAlpha.context(person).unknownFieldSchemas?.get(Person);
// Map { "nickname" => { kind: FieldKind.Optional, simpleAllowedTypes: Map { "com.fluidframework.leaf.string" => ... }, ... } }

const content = TreeAlpha.exportVerbose(person, { keys: KeyEncodingOptions.allStoredKeys });
// { type: "com.example.Person", fields: { name: "Ali", nickname: "Al" } }
```
