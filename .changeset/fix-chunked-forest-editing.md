---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": fix
---
Improve validation in SharedTree forests

Our [ForestType](https://fluidframework.com/docs/api/tree/foresttype-interface) implementations now have better and more consistent validation of changes being applied.
This should only impact cases which have hit bugs, resulting in edits which are not valid for the tree they are being applied to.
Now the asserts should be more specific, helping to triage such issues.
This also reduces he risk of of document corruption by catching invalid data earlier and more consistently.
