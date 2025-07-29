---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Support unknown optional fields in TreeBeta.clone, TreeAlpha.exportConcise and TreeAlpha.exportVerbose

Trees with [unknown optional fields](https://fluidframework.com/docs/api/fluid-framework/schemafactoryobjectoptions-interface#allowunknownoptionalfields-propertysignature) are now supported in [TreeBeta.clone](https://fluidframework.com/docs/api/tree/treebeta-interface#clone-methodsignature), [TreeBeta.exportConcise](https://fluidframework.com/docs/api/tree/treealpha-interface#exportconcise-methodsignature) and [TreeBeta.exportVerbose](https://fluidframework.com/docs/api/tree/treealpha-interface#exportverbose-methodsignature).

Previously attempts to clone or export such nodes could error in some cases, and should now work robustly.
