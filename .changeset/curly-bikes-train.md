---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": feature
---
Adds staged allowed types to SchemaFactoryAlpha

This adds the `staged` API to [`SchemaFactoryAlpha`](https://fluidframework.com/docs/api/fluid-framework/schemafactoryalpha-class).
Staged allowed types can be used for schema evolution to add members to an [`AllowedTypes`](https://fluidframework.com/docs/api/fluid-framework/allowedtypes-typealias) while supporting cross version collaboration.

Staged allowed types are [allowed types](https://fluidframework.com/docs/api/fluid-framework/allowedtypes-typealias) that can be upgraded by [schema upgrades](https://fluidframework.com/docs/api/fluid-framework/treeview-interface#upgradeschema-methodsignature).
Before being upgraded, any attempt to insert or move a node to a location which requires its type to be upgraded to be valid will throw an error.

To add a new member to an `AllowedTypes`, add the type wrapped by `staged`.
For example, migrating an array which previously supported only numbers to support both numbers and strings would start by deploying a version of the app using `staged`:
```typescript
class TestArray extends schemaFactoryAlpha.arrayAlpha("TestArray", [SchemaFactoryAlpha.number, SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string)]) {}
```

Once enough clients have this code update, it is safe to allow writing strings to the array.
To allow writing strings to the array, a code change must be made to remove the staged annotation:
```typescript
class TestArray extends schemaFactoryAlpha.arrayAlpha("TestArray", [schemaFactoryAlpha.number, schemaFactoryAlpha.string]) {}
```

Then when opening old documents [upgradeSchema](https://fluidframework.com/docs/api/fluid-framework/treeview-interface#upgradeschema-methodsignature) is used to upgrade the stored schema:
```typescript
view.upgradeSchema()
```

The `@alpha` API [extractPersistedSchema](https://fluidframework.com/docs/api/fluid-framework#extractpersistedschema-function) now takes the schema as an `ImplicitAnnotatedFieldSchema` and an additional parameter to filter which staged upgrades it includes.

Below is a full example of how the schema migration process works.
This can also be found in the [tests](https://github.com/CraigMacomber/FluidFramework/blob/readonly-allowedtypes/packages/dds/tree/src/test/simple-tree/api/stagedSchemaUpgrade.spec.ts).

```typescript
// Schema A: only number allowed
const schemaA = SchemaFactoryAlpha.optional([SchemaFactoryAlpha.number]);

// Schema B: number or string (string is staged)
const schemaB = SchemaFactoryAlpha.optional([
	SchemaFactoryAlpha.number,
	SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string),
]);

// Schema C: number or string, both fully allowed
const schemaC = SchemaFactoryAlpha.optional([
	SchemaFactoryAlpha.number,
	SchemaFactoryAlpha.string,
]);

// Initialize with schema A.
const configA = new TreeViewConfiguration({
	schema: schemaA,
});
const viewA = treeA.viewWith(configA);
viewA.initialize(5);

// Since we are running all the different versions of the app in the same process making changes synchronously,
// an explicit flush is needed to make them available to each other.
synchronizeTrees();

assert.deepEqual(viewA.root, 5);

// View the same document with a second tree using schema B.
const configB = new TreeViewConfiguration({
	schema: schemaB,
});
const viewB = treeB.viewWith(configB);
// B cannot write strings to the root.
assert.throws(() => (viewB.root = "test"));

// View the same document with a third tree using schema C.
const configC = new TreeViewConfiguration({
	schema: schemaC,
});
const viewC = treeC.viewWith(configC);
// Upgrade to schema C
viewC.upgradeSchema();
// Use the newly enabled schema.
viewC.root = "test";

synchronizeTrees();

// View A is now incompatible with the stored schema:
assert.equal(viewA.compatibility.canView, false);

// View B can still read the document, and now sees the string root which relies on the staged schema.
assert.deepEqual(viewB.root, "test");
```
