---
"@fluidframework/merge-tree": minor
"@fluidframework/sequence": minor
"__section": fix
---
Preserve SharedString content when loading multi-chunk flat snapshots

Loading a flat snapshot with a mixture of older content and recent edits now uses the snapshot's sequence number to place body segments.
Previously, loading could fail or duplicate content when recent edits crossed snapshot chunk boundaries.
