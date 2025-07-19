---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": feature
---
Adds staged allowed types to SchemaFactoryAlpha

This adds the `staged` API to [`SchemaFactoryAlpha`](https://fluidframework.com/docs/api/fluid-framework/schemafactoryalpha-class).
Staged allowed types can be used for schema evolution to add members to an [`AllowedTypes`](https://fluidframework.com/docs/api/fluid-framework/allowedtypes-typealias) while supporting cross version collaboration.

Staged allowed types are allowed types that can be upgraded by schema upgrades.
Before being upgraded, any attempt to insert or move a node to a location which requires its type to be upgraded to be valid will throw an error.

To add a new member to an `AllowedTypes`, add the type wrapped by `staged`.
For example, migrating an array which previously supported only numbers to support both numbers and strings would start by deploying a version of the app using `staged`:
```typescript
schemaFactoryAlpha.arrayAlpha("TestArray", [schemaFactoryAlpha.number, schemaFactoryAlpha.staged(schemaFactoryAlpha.string)]);
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
