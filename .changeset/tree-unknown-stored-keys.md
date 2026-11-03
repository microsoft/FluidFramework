---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Add a key encoding option to export only unknown optional fields

The new `KeyEncodingOptions.unknownStoredKeys` option makes [`TreeAlpha.exportVerbose`](https://fluidframework.com/docs/api/fluid-framework/treealpha-interface#exportverbose-methodsignature) and [`TreeBeta.exportConcise`](https://fluidframework.com/docs/api/fluid-framework/treebeta-interface) export only the [unknown optional fields](https://fluidframework.com/docs/api/fluid-framework/objectschemaoptions-interface#allowunknownoptionalfields-propertysignature) in the tree, and the known content needed to locate them.
Fields use their stored keys.
You can use this option only for export.

The full content of each unknown optional field is included.
Known fields of object nodes are included only if there are unknown optional fields under them.

Map, record, and array nodes on the path to an unknown optional field include all of their entries and elements.
To tell the unknown optional fields from this known content, use [`TreeContextAlpha.unknownFieldSchemas`](https://fluidframework.com/docs/api/fluid-framework/treecontextalpha-interface#unknownfieldschemas-propertysignature).
For each object node schema, it lists the stored keys of the unknown optional fields.
Use it with `TreeAlpha.exportVerbose`, which includes the type of each node, to find these fields in the export.
This is useful when you must show or process the unknown data separately from known content.

#### Example

Version 1 of an application defines a `Person` with a `name` field and an `address` field, and allows unknown optional fields:

```typescript
const sf = new SchemaFactoryBeta("com.example");
class Address extends sf.object(
	"Address",
	{ city: sf.string },
	{ allowUnknownOptionalFields: true },
) {}
class Person extends sf.object(
	"Person",
	{ name: sf.string, address: Address },
	{ allowUnknownOptionalFields: true },
) {}
```

Version 2 of the application adds an optional `nickname` field to `Person` and an optional `zip` field to `Address`:

```typescript
class Address extends sf.object(
	"Address",
	{ city: sf.string, zip: sf.optional(sf.string) },
	{ allowUnknownOptionalFields: true },
) {}
class Person extends sf.object(
	"Person",
	{ name: sf.string, nickname: sf.optional(sf.string), address: Address },
	{ allowUnknownOptionalFields: true },
) {}
```

Version 1 can still open a document after version 2 upgrades its schema, but the `nickname` and `zip` fields are unknown to it.
Version 1 can use `unknownStoredKeys` to export only these fields, and the path to them:

```typescript
// In version 1 of the application:
TreeAlpha.exportVerbose(person, { keys: KeyEncodingOptions.unknownStoredKeys });
// {
// 	type: "com.example.Person",
// 	fields: {
// 		nickname: "Al",
// 		address: { type: "com.example.Address", fields: { zip: "75001" } },
// 	},
// }

TreeBeta.exportConcise(person, { keys: KeyEncodingOptions.unknownStoredKeys });
// { nickname: "Al", address: { zip: "75001" } }
```
