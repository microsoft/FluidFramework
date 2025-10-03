---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Update TableSchema APIs (alpha) to use SchemaFactoryBeta instead of SchemaFactoryAlpha

Makes the [TableSchema](https://fluidframework.com/docs/api/fluid-framework/tableschema-namespace) APIs more flexible, and prepares them for future promotion to beta themselves.

Adds `objectBeta` method to [SchemaFactoryBeta](https://fluidframework.com/docs/api/fluid-framework/schemafactorybeta-class), which adds support for [SchemaFactoryObjectOptions.allowOptionalUnknownFields](https://fluidframework.com/docs/api/fluid-framework/schemafactoryobjectoptions-interface#allowunknownoptionalfields-propertysignature) (previously alpha-only).
