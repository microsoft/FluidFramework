---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Add SchemaFactoryBeta

`SchemaFactoryBeta` is added to provide a place to partially stabilize APIs from [`SchemaFactoryAlpha`](https://fluidframework.com/docs/api/fluid-framework/schemafactoryalpha-class).
Initially just one APIs is added as `@beta`: `scopedFactory`.
Users of the existing `@alpha` `scopedFactory` API on `SchemaFactoryAlpha` will need to update to use `scopedFactoryAlpha` if they require the returned factory to be a `SchemaFactoryAlpha` instance.
