---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": feature
---
Adds enablable allowed types to SchemaFactoryAlpha

This adds the `enablable` API to [`SchemaFactoryAlpha`](https://fluidframework.com/docs/api/fluid-framework/schemafactoryalpha-class).
Enablables can be used for schema evolution to add members to an [`AllowedTypes`](https://fluidframework.com/docs/api/fluid-framework/allowedtypes-typealias) while supporting cross version collaboration.

Enablables are allowed types that can be enabled by schema upgrades.
Before being enabled, any attempt to insert or move a node to a location which requires the enablement for its type to be valid will throw an error.

To add a new member to an `AllowedTypes`, add the type wrapped by `enablable`.
For example, migrating an array which previously supported only numbers to support both numbers and strings would start by deploying a version of the app using `enablable`:
```typescript
schemaFactoryAlpha.arrayAlpha("TestArray", [schemaFactoryAlpha.number, schemaFactoryAlpha.enablable(schemaFactoryAlpha.string)]);
```

Once enough clients have this code update, it is safe to allow writing strings to the array.
To enable writing strings to the array, a code change must be made to remove the enablable annotation:
```typescript
schemaFactoryAlpha.arrayAlpha("TestArray", [schemaFactoryAlpha.number, schemaFactoryAlpha.string]);
```

And then a schema upgrade is done to upgrade the stored schema:
```typescript
view.upgradeSchema()
```


In the future, SharedTree may add an API that allows enablables to be enabled via a runtime schema upgrade so that the type can be more easily deployed using a configuration flag change rather than a code change.
