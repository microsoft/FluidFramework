---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Reduce repeated schema conversion for SharedTree

SharedTree reuses derived stored schemas across staged-upgrade policies when the view schema contains no staging.
Schemas with staged upgrades continue to use policy-specific stored schemas.
Unhydrated node contexts reuse the cached schema analysis instead of traversing the schema again.
Staging reachability is cached per node schema, so overlapping roots reuse descendant analysis, including recursive schemas.
