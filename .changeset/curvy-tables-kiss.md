---
"@fluidframework/tree": minor
"fluid-framework": minor
---
---
"section": tree
---

Fix reading of `null` from unhydrated trees

Unhydrated trees containing object nodes with required fields set to `null` used to throw an error.
This has been fixed.
