---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
SharedTrees's FluidClientVersion enum (alpha) has been redesigned

Users of [FluidClientVersion](https://fluidframework.com/docs/api/fluid-framework/fluidclientversion-enum)'s `v2_1`, `v2_2`, and `v2_3` entries should specify `v2_0` instead.
This will result in no functional differences since no code currently opts into any additional functionality based on specifying those versions.
The new approach avoids listing versions which there is currently no reason to select, and thus these options have been removed.
If future work adds support to opt into features which only work starting with some of those versions, they will be re-added at that time.
