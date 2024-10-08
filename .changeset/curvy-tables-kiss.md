---
"@fluidframework/tree": minor
"fluid-framework": minor
---
---
"section": tree
---

Fix reading of `null` from unhydrated trees

Unhydrated trees containing object nodes with required fields set to `null` used to throw an error.
This was a bug: `null` is a valid value in tree's whose schema allow it, and this specific case now correctly returns `null` values when appropriate without erroring.
