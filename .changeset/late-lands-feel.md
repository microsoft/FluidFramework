---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Support unknown optional fields in TreeBeta.clone

Trees with [unknown optional fields](https://fluidframework.com/docs/api/fluid-framework/schemafactoryobjectoptions-interface#allowunknownoptionalfields-propertysignature) are now supported in [TreeBeta.clone](https://fluidframework.com/docs/api/tree/treebeta-interface#clone-methodsignature).

Previously attempts to clone such nodes would throw errors.
