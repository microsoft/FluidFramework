---
"@fluidframework/tree": minor
"__section": feature
---
Adds an alpha API method `TreeAlpha.key2`

This method is meant to eventually replace the public Tree.key method. This new method now returns undefined in the case where there is a root node.
