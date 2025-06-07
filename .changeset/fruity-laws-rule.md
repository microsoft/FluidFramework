---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Defaulted identifier fields on unhydrated nodes are now enumerable

Previously, there was a special case for defaulted [identifier](https://fluidframework.com/docs/api/fluid-framework/schemafactory-class#identifier-property) fields on unhydrated nodes where they were not enumerable.
This special case has been removed: they are now enumerable independent of hydration status and defaulting.
