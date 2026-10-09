---
"@fluidframework/tree": minor
"__section": tree
---
Integer-only SharedTree formats use specialized validation

Counts, indices, and identifiers that already require integer values now use integer schemas.
Their numeric bounds and serialized data formats are unchanged.
This lets validation use dedicated integer checks instead of general multiple-of checks.
