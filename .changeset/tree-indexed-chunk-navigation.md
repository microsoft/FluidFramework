---
"@fluidframework/tree": minor
"__section": tree
---
Improve position lookup in chunked SharedTree fields

The optimized SharedTree forest uses binary search to locate nodes in fields stored across multiple chunks.
Cumulative chunk offsets are maintained during edits, so subsequent reads do not rebuild the index.
Compatible leaf replacements retain packed storage without recalculating unchanged offsets.
