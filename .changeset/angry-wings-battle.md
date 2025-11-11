---
"@fluidframework/tree": minor
"__section": feature
---
Schema snapshot compatibility checker

This change adds alpha APIs for snapshotting schemas and testing their compatibility for the purposes of schema migrations.

New APIs:

- `checkCompatibility`
- `parseCompatibilitySchema`
- `snapshotCompatibilitySchema`

#### Example: Current view schema vs. historical view schema

At some point in the past, the application author wrote a schema to disk using `snapshotCompatibilitySchema`:

```ts
const schemaFactory = new SchemaFactory("test");
class Point2D extends schemaFactory.object("Point", {
	x: factory.number,
	y: factory.number,
}) {}

const storedAsView = new TreeViewConfiguration({ schema: Point2D });
fs.writeFileSync("Point2D.json", snapshotCompatibilitySchema(storedAsView));
```

Next they created a regression test to ensure that the current view schema can read content written by the original view
schema (`SchemaCompatibilityStatus.canUpgrade`):

```ts
// Build the current view schema
const schemaFactory = new SchemaFactory("test");
class Point3D extends schemaFactory.object("Point", {
	x: factory.number,
	y: factory.number,

	// The current schema has a new optional field that was not present on Point2D
	z: factory.optional(factory.number),
}) {}

const oldViewSchema = parseCompatibilitySchema(fs.readFileSync("Point2D.json"));

// Check to see if the document created by the historical view schema can be opened with the current view schema
const compatibilityStatus = checkCompatibility(oldViewSchema, currentViewSchemaSimple);

// We expect to be able to read content written with the historical schema using the current schema
const expected: Omit<SchemaCompatibilityStatus, "canInitialize"> = {
	canView: false,
	canUpgrade: true,
	isEquivalent: false,
};
assert.deepEqual(compatibility, expected);
```
