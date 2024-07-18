---
"fluid-framework": minor
"@fluidframework/tree": minor
---

tree: Improved performance for accessing identifiers in shortId API

Users should see improved performance when calling the `Tree.shortId` API. Identifier field keys are now cached in the schema for faster access.
