---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Formatted text uniform runs now account for optional formatting fields

`getUniformRun` now ends a uniform run when an optional formatting field is present on only one side of a character boundary.
This prevents characters with different formatting from being included in the same uniform run.
