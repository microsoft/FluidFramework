---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Export only the fields of a tree that you select

[`TreeAlpha.exportVerbose`](https://fluidframework.com/docs/api/fluid-framework/treealpha-interface#exportverbose-methodsignature) now has a `filter` option.
Use it to export only part of a tree.
For example, you can export only the [unknown optional fields](https://fluidframework.com/docs/api/fluid-framework/objectschemaoptions-interface#allowunknownoptionalfields-propertysignature) of a node.
Before this change, you had to export the full tree and then filter the result.

The filter is a [`TreeFieldFilter`](https://fluidframework.com/docs/api/fluid-framework/treefieldfilter-typealias).
The export calls it for each field of each node that it visits.
For an array node, the export calls it one time, for the field that contains all the elements.
If the filter omits this field, the result has an empty array of elements.
The filter gets the stored schema of the node, the stored key of the field, and the identifier of the node's schema.
It returns one of these values:

- `false`, to omit the field.
- `true`, to include the field with all of its content.
- A filter, to include the field and use that filter for the fields of the nodes in it.

A leaf node has no fields, so the result always includes the value of a leaf node in full.

The filter uses stored schema and stored keys, because the content of unknown optional fields can have no view schema.
To filter unknown optional fields, export with [`KeyEncodingOptions.allStoredKeys`](https://fluidframework.com/docs/api/fluid-framework/keyencodingoptions-enum#allstoredkeys-enummember).
The other key options omit unknown optional fields before the export calls the filter.

If the filter omits a required field, you cannot import the result again.

#### Example

Version 1 of an application defines a `Person` with a `name` field, and allows unknown optional fields:

```typescript
const factory = new SchemaFactoryAlpha("com.example");
class Person extends factory.objectAlpha(
	"Person",
	{ name: factory.string },
	{ allowUnknownOptionalFields: true },
) {}
```

Version 2 adds an optional `nickname` field and an optional `address` field.
The `address` field contains an `Address` object node with `street` and `city` fields.
After version 2 upgrades the schema of a document, version 1 does not know these fields or the `Address` schema.

Version 1 can export only the unknown optional fields of a `Person`, with all of their content:

```typescript
// In version 1 of the application:
const unknownFields = TreeAlpha.context(person).unknownFieldSchemas?.get(Person);
const filter: TreeFieldFilter = (parentSchema, storedKey) =>
	unknownFields?.has(storedKey) === true;
const data = TreeAlpha.exportVerbose(person, {
	keys: KeyEncodingOptions.allStoredKeys,
	filter,
});
// {
// 	type: "com.example.Person",
// 	fields: {
// 		nickname: "Al",
// 		address: {
// 			type: "com.example.Address",
// 			fields: { street: "1 Main St", city: "Springfield" },
// 		},
// 	},
// }
```

The result does not have the known `name` field.
Version 1 has no view schema for `Address`, but the result has its type, because the filter uses the stored schema.
