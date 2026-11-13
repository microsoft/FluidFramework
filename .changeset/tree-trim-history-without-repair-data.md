---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Reduce the cost of trimming history that has no repair data

When commits leave the collaboration window, their repair data (the content of removed nodes) is destroyed.
Commits without repair data, such as inserts, no longer edit the forest when they are trimmed.
This reduces the cost of receiving edits.