---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": feature
---
Adds staged allowed types to SchemaFactoryAlpha

This adds the `staged` API to [`SchemaFactoryAlpha`](https://fluidframework.com/docs/api/fluid-framework/schemafactoryalpha-class).
Staged allowed types can be used for schema evolution to add members to an [`AllowedTypes`](https://fluidframework.com/docs/api/fluid-framework/allowedtypes-typealias) while supporting cross version collaboration.

Staged allowed types are [allowed types](https://fluidframework.com/docs/api/fluid-framework/allowedtypes-typealias) that can be upgraded by [schema upgrades}(https://fluidframework.com/docs/api/fluid-framework/treeview-interface#upgradeschema-methodsignature).
Before being upgraded, any attempt to insert or move a node to a location which requires its type to be upgraded to be valid will throw an error.

To enable this feature, [schema validation](https://fluidframework.com/docs/api/fluid-framework/treeviewconfiguration-class#enableschemavalidation-property) is now performed by default when editing the tree.

To add a new member to an `AllowedTypes`, add the type wrapped by `staged`.
For example, migrating an array which previously supported only numbers to support both numbers and strings would start by deploying a version of the app using `staged`:
```typescript
schemaFactoryAlpha.arrayAlpha("TestArray", [SchemaFactoryAlpha.number, SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string)]);
```

Once enough clients have this code update, it is safe to allow writing strings to the array.
To allow writing strings to the array, a code change must be made to remove the staged annotation:
```typescript
schemaFactoryAlpha.arrayAlpha("TestArray", [schemaFactoryAlpha.number, schemaFactoryAlpha.string]);
```

And then a schema upgrade is done to upgrade the stored schema:
```typescript
view.upgradeSchema()
```

In the future, SharedTree will add an API that allows staged allowed types to be upgraded via a runtime schema upgrade so that the type can be more easily deployed using a configuration flag change rather than a code change.

Below is a full example of how the schema migration process works. This can also be found in our tests.

```typescript
// schema A: only number allowed
const schemaA = factory.optional([SchemaFactoryAlpha.number]);

// schema B: number or string (string is staged)
const schemaB = factory.optional([
	SchemaFactoryAlpha.number,
	factory.staged(SchemaFactoryAlpha.string),
]);

// schema C: number or string, both fully allowed
const schemaC = factory.optional([SchemaFactoryAlpha.number, SchemaFactoryAlpha.string]);

const provider = new TestTreeProviderLite(3);

// initialize with schema A
const configA = new TreeViewConfiguration({
	schema: schemaA,
});
const viewA = provider.trees[0].viewWith(configA);
viewA.initialize(5);
provider.synchronizeMessages();

assert.deepEqual(viewA.root, 5);

// view second tree with schema B
const configB = new TreeViewConfiguration({
	schema: schemaB,
});
const viewB = provider.trees[1].viewWith(configB);
// check that we can read the tree
assert.deepEqual(viewB.root, 5);
// upgrade to schema B
viewB.upgradeSchema();
provider.synchronizeMessages();

// check view A can read the document
assert.deepEqual(viewA.root, 5);
// check view B cannot write strings to the root
assert.throws(() => {
	viewB.root = "test";
});

// view third tree with schema C
const configC = new TreeViewConfiguration({
	schema: schemaC,
});
const viewC = provider.trees[2].viewWith(configC);
// upgrade to schema C and change the root to a string
viewC.upgradeSchema();
viewC.root = "test";
provider.synchronizeMessages();

// view A is now incompatible with the stored schema
assert.throws(() => {
	const _ = viewA.root;
});
assert.deepEqual(viewB.root, "test");
assert.deepEqual(viewC.root, "test");
```
