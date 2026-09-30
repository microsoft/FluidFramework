---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
createIndependentTreeAlpha no longer has the unused TSchema type parameter

The unused `TSchema` type parameter has been removed from `createIndependentTreeAlpha`.
Calls that explicitly supply a type argument to `createIndependentTreeAlpha` must remove it.

`createIndependentTreeBeta` keeps its deprecated type parameter temporarily for compatibility, but the type parameter continues to have no effect.
Callers should omit it.
