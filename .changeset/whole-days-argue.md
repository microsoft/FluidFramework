---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Add overrides for more instance properties in SchemaFactoryAlpha

[SchemaFactoryAlpha](https://fluidframework.com/docs/api/fluid-framework/schemafactoryalpha-class) provides proposed updates to several SchemaFactory APIs. With this change, it now exposes these not only for the static members but also the redundant instance properties for `leaves`, `optional`, `required` and `optionalRecursive`.

Additionally an alpha override for `requiredRecursive` was added to both the statics and instance properties.
