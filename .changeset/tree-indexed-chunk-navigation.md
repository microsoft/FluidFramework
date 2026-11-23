---
"@fluidframework/tree": minor
"__section": tree
---
Improve position lookup in chunked SharedTree fields

The optimized SharedTree forest groups long fields into sequence chunks and uses binary search to locate nodes within them.
Short fields retain flat storage without a persistent per-field index or index owner.
Cumulative chunk offsets are maintained during edits, so subsequent reads do not rebuild the index.
Compatible leaf replacements retain packed storage without recalculating unchanged offsets.
