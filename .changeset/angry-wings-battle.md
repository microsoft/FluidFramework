---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Schema snapshot compatibility checker

This change adds alpha APIs for creating snapshots of view schema and testing their compatibility for the purposes
of schema migrations.

New APIs:

- `checkCompatibility` - Checks the compatibility of the view schema which created the document against the view schema
being used to open it.
- `importCompatibilitySchemaSnapshot` - Parse a JSON representation of a tree schema into a concrete schema.
- `exportCompatibilitySchemaSnapshot` - Returns a JSON representation of the tree schema for snapshot compatibility checking.

#### Example: Current view schema vs. historical view schema

An application author is developing an app that has a schema for storing 2D Points.
They wish to maintain backwards compatibility in future versions and avoid changing their view schema in a way that breaks
this behavior.
When introducing a new initial schema, they persists a snapshot using `exportCompatibilitySchemaSnapshot`:

```ts
const factory = new SchemaFactory("test");

// The past view schema, for the purposes of illustration. This wouldn't normally appear as a concrete schema in the test
// checking compatibility, but rather would be loaded from a snapshot.
class Point2D extends factory.object("Point", {
	x: factory.number,
	y: factory.number,
}) {}
const viewSchema = new TreeViewConfiguration({ schema: Point2D });
const encodedSchema = JSON.stringify(exportCompatibilitySchemaSnapshot(viewSchema));
fs.writeFileSync("PointSchema.json", encodedSchema);
```

Next they create a regression test to ensure that the current view schema can read content written by the original view
schema (`SchemaCompatibilityStatus.canUpgrade`). Initially `currentViewSchema === Point2D`:

```ts
const encodedSchema = JSON.parse(fs.readFileSync("PointSchema.json", "utf8"));
const oldViewSchema = importCompatibilitySchemaSnapshot(encodedSchema);

// Check to see if the document created by the historical view schema can be opened with the current view schema
const compatibilityStatus = checkCompatibility(oldViewSchema, currentViewSchema);

// Check to see if the document created by the historical view schema can be opened with the current view schema
const backwardsCompatibilityStatus = checkCompatibility(oldViewSchema, currentViewSchema);

// z is not present in Point2D, so the schema must be upgraded
assert.equal(backwardsCompatibilityStatus.canView, false);

// The schema can be upgraded to add the new optional field
assert.equal(backwardsCompatibilityStatus.canUpgrade, true);
```

Additionally, they a regression test to ensure that older view schemas can read content written by the current view
schema (`SchemaCompatibilityStatus.canView`):

```ts
// Test what the old version of the application would do with a tree using the new schema:
const forwardsCompatibilityStatus = checkCompatibility(currentViewSchema, oldViewSchema);

// If the old schema set allowUnknownOptionalFields, this would be true, but since it did not,
// this assert will fail, detecting the forwards compatibility break:
// this means these two versions of the application cannot collaborate on content using these schema.
assert.equal(forwardsCompatibilityStatus.canView, true);
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

The test first compatibility test will pass as the Point2D schema is upgradeable to a Point3D schema.
However, the second compatibility test fill fail as an application using the Point2D view schema cannot collaborate on
content authored using the Point3D schema.
