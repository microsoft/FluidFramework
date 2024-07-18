---
"fluid-framework": minor
"@fluidframework/tree": minor
---

Improved performance for accessing identifiers

Identifier field keys are now cached in the schema for faster access to identifiers when calling the Tree.shortId api.
