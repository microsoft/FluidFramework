---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Reduce memory overhead for SharedTree maps and records

Map and record reads allocate less memory, and edits no longer cause cached empty entries to accumulate.
These improvements require no application code changes.
