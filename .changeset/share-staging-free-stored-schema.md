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
Mutually recursive roots also share immutable converted node definitions under the permissive staged-upgrade policy.
Root fields, contexts, and policy-specific stored-schema wrappers remain root-specific.
Configuration validation and component discovery share one iterative traversal.
Configuration-specific checks still run when component analysis is cached.
Definition map iteration order is unspecified.
Compatibility snapshots canonicalize definition order; schema hashes and persisted schema encoding are unchanged.
