---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Reduce repeated schema conversion for SharedTree

SharedTree reuses derived stored schemas across staged-upgrade policies when the view schema contains no staging.
Schemas with staged upgrades continue to use policy-specific stored schemas.
Unhydrated node contexts reuse the cached schema analysis instead of traversing the schema again.
Mutually recursive node schemas share completed staging analysis and one lazily constructed definitions map.
Unhydrated contexts reuse that map without copying it.
Roots share converted node definitions through components computed under each staged-upgrade policy.
Roots in the same policy-filtered component also share their stored node-definition map.
Components with no reachable staging reuse common conversions across policies, including when referenced by staged schemas.
Root fields, contexts, and policy-specific stored-schema wrappers remain root-specific.
Configuration validation and component discovery share one iterative traversal.
Configuration-specific checks still run when component analysis is cached.
Hydrated contexts and index setup also reuse the cached reachable definitions instead of walking the schema again.
Simple-schema copies and compatibility snapshots reuse those definitions while still returning fresh output on each call.
Definition map iteration order is unspecified.
Compatibility snapshots canonicalize definition order; schema hashes and persisted schema encoding are unchanged.
