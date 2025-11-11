---
"@fluidframework/tree": minor
"__section": feature
---
Schema snapshot compatibility checker

This change adds alpha APIs for creating snapshots of v;iew schemas and testing their compatibility for the purposes
of schema migrations.

New APIs:

- `checkCompatibility` - Checks the compatibility of the view schema which created the document against the view schema
being used to open it.
- `parseCompatibilitySchema` - Parse a JSON representation of a tree schema into a concrete schema.
- `snapshotCompatibilitySchema` - Returns a JSON representation of the tree schema for snapshot compatibility checking.

#### Example: Current view schema vs. historical view schema

An application author is developing an app that has a schema for storing 2D Points.
They wish to maintain backwards compatibility in future versions and avoid changing their view schema in a way that breaks
this behavior.
When introducing a new initial schema, they persists a snapshot using `snapshotCompatibilitySchema`:

```ts
const schemaFactory = new SchemaFactory("test");
class Point2D extends schemaFactory.object("Point", {
	x: factory.number,
	y: factory.number,
}) {}

const storedAsView = new TreeViewConfiguration({ schema: Point2D });
fs.writeFileSync("Point2D.json", snapshotCompatibilitySchema(storedAsView));
```

Next they create a regression test to ensure that the current view schema can read content written by the original view
schema (`SchemaCompatibilityStatus.canUpgrade`). Initially `currentViewSchema === Point2D`:

```ts
const oldViewSchema = parseCompatibilitySchema(fs.readFileSync("Point2D.json"));

// Check to see if the document created by the historical view schema can be opened with the current view schema
const compatibilityStatus = checkCompatibility(oldViewSchema, currentViewSchema);

// We expect to be able to read content written with the historical schema using the current schema
const expected: Omit<SchemaCompatibilityStatus, "canInitialize"> = {
	canView: false,
	canUpgrade: true,
	isEquivalent: false,
};
assert.deepEqual(compatibility, expected);
```

Later in the application development cycle, the application author decides they want to change their Point2D to
a Point3D, adding an extra field:

```ts
// Build the current view schema
const schemaFactory = new SchemaFactory("test");
class Point3D extends schemaFactory.object("Point", {
	x: factory.number,
	y: factory.number,

	// The current schema has a new optional field that was not present on Point2D
	z: factory.optional(factory.number),
}) {}
```

The test will still pass as the Point2D schema is upgradeable to a Point3D schema.
