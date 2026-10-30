---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Allow unknown optional object fields by default

Object schemas created by [`SchemaFactory`](https://fluidframework.com/docs/api/fluid-framework/schemafactory-class), [`SchemaFactoryBeta`](https://fluidframework.com/docs/api/fluid-framework/schemafactorybeta-class), and `SchemaFactoryAlpha` now allow unknown optional fields by default universally.
This makes older application versions forward-compatible with documents whose stored schema has added optional fields, without requiring every object schema to specify `allowUnknownOptionalFields: true`.

Applications that require an exact match between the object view schema and stored schema can retain the previous behavior by explicitly setting `allowUnknownOptionalFields: false`.
The `allowUnknownOptionalFields` option is available on the public [`SchemaFactory.object`](https://fluidframework.com/docs/api/fluid-framework/schemafactory-class#object-methodsignature) API so public API users can opt out without adopting beta APIs:

```typescript
const schemaFactory = new SchemaFactory("com.example");

class StrictPerson extends schemaFactory.object(
	"Person",
	{
		name: schemaFactory.string,
	},
	{
		allowUnknownOptionalFields: false,
	},
) {}
```

Customers using alpha and beta APIs will also be able to set `allowUnknownOptionalFields: false` once on `SchemaFactoryBeta` and `SchemaFactoryAlpha` to preserve the previous default for all object schemas created by that factory.
This factory-level configuration is beta functionality and may change without notice.

```typescript
const factory = new SchemaFactoryBeta({
	scope: "com.example",
	objectOptionDefaults: (_name, _fields, options) => ({
		allowUnknownOptionalFields: false,
		...options,
	}),
});
```

#### Behavior to review

Code that reads only known properties does not observe unknown fields.
As a result, application implementations of cloning, equality, serialization, or object reconstruction may omit unknown data even though SharedTree preserves it internally.
Spreading a node into a new object also includes only the known view-schema properties.
Review any code that round-trips a node by reading its known properties and constructing a replacement, since such code may silently discard unknown fields.

For example, if a newer client adds an optional `nickname` field, an older client using this view can read the document:

```typescript
class Person extends schemaFactory.object("Person", {
	name: schemaFactory.string,
}) {}

function clonePerson(person: Person): Person {
	return new Person({ name: person.name });
}
```

Calling `clonePerson` omits `nickname` because the older view does not expose that property, even though SharedTree preserved it on the original node.

Use [`TreeBeta.clone`](https://fluidframework.com/docs/api/fluid-framework/treebeta-interface#clone-methodsignature) when cloning a tree while preserving unknown fields.
When exporting, [`TreeAlpha.exportVerbose`](https://fluidframework.com/docs/api/fluid-framework/treealpha-interface#exportverbose-methodsignature) preserves unknown fields only when configured to use all stored keys.

```typescript
const exported = TreeAlpha.exportVerbose(person, {
	keys: KeyEncodingOptions.allStoredKeys,
});
```

Using `KeyEncodingOptions.knownStoredKeys` or `KeyEncodingOptions.usePropertyKeys` omits unknown optional fields.
Unhydrated nodes created using constructors or insertable content, and nodes created with `TreeAlpha.importVerbose`, do not support unknown optional fields.

Applications whose code depends on enumerating every field, reconstructs nodes from their known properties, or requires schema equality rather than forward compatibility should set `allowUnknownOptionalFields: false` on the affected object schemas:

```typescript
class StrictPerson extends schemaFactory.object(
	"Person",
	{
		name: schemaFactory.string,
	},
	{
		allowUnknownOptionalFields: false,
	},
) {}
```

#### Schema compatibility snapshots

Applications using [`snapshotSchemaCompatibility`](https://fluidframework.com/docs/api/fluid-framework/alpha/snapshotschemacompatibility-function) with object schemas from any schema factory will see snapshot-test failures because the serialized view schema changes from `allowUnknownOptionalFields: false` to `allowUnknownOptionalFields: true`.
Review the affected schemas, retain historical snapshots unchanged, and generate a current-version snapshot to record the new forward-compatible behavior.
Alternatively, explicitly set `allowUnknownOptionalFields: false` to retain the previous behavior and avoid a new snapshot.

For example, if the snapshot directory contains `3.9.0.json`, leave that file unchanged and regenerate snapshots so a new `3.10.0.json` records `allowUnknownOptionalFields: true`:

```text
schema-compatibility-snapshots/
├── 3.9.0.json  # Retained with allowUnknownOptionalFields: false
└── 3.10.0.json # Added with allowUnknownOptionalFields: true
```

If the schema must remain strict instead, opt out before rerunning the snapshot test:

```typescript
class StrictPerson extends schemaFactory.object(
	"Person",
	{
		name: schemaFactory.string,
	},
	{
		allowUnknownOptionalFields: false,
	},
) {}
```

Snapshot failures identify schemas whose compatibility contract changed, but do not verify that application cloning, equality, serialization, or reconstruction code safely handles unknown fields.
