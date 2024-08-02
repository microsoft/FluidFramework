---
"fluid-framework": minor
"@fluidframework/tree": minor
---

Add a function `isRepoSuperset` to determines whether the `view` schema allows a superset of the documents that the `stored` schema allows.
Specifically, it utilizes the incompatibilities returned from `getAllowedContentIncompatibilities` to validate if changes to a document schema
are backward-compatible.
