---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Stabilize allowUnknownOptionalFields to beta

When constructing object node schema with `SchemaFactoryBeta.object` or `SchemaFactoryBeta.objectRecursive` you can now provide the `allowUnknownOptionalFields` option as well as other `metadata` which were previously only available in `SchemaFactoryAlpha.objectAlpha` and `SchemaFactoryAlpha.objectRecursive`.

Additionally the alpha interface `SchemaFactoryObjectOptions` has been renamed to `ObjectSchemaOptionsAlpha` to better align with the other related types.
