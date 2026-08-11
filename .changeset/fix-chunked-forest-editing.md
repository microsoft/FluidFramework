---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": fix
---
Improve validation in the optimized SharedTree forest

This issue only affects applications configured to use [`ForestTypeOptimized`](https://fluidframework.com/docs/api/tree#foresttypeoptimized-variable).
The optimized forest now performs additional validation and assertions around internal edits.
These checks detect inconsistencies closer to their source and provide more actionable failures when triaging issues.
