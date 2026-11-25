---
"@fluidframework/tree": minor
"__section": tree
---
Improve position lookup in chunked SharedTree fields

The optimized SharedTree forest keeps small fields in simple arrays and uses balanced, indexed sequence groups for long fields.
With the default grouping policy, repeated insertions split overflowing groups, and deletions merge or redistribute groups to keep navigation depth logarithmic in the number of chunks.
Cumulative chunk offsets are maintained during edits, so subsequent reads do not rebuild the index.
Compatible leaf replacements retain packed storage without recalculating unchanged offsets.
