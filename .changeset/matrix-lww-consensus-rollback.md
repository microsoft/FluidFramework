---
"@fluidframework/matrix": minor
"__section": fix
---
Fix incorrect rollback of pending `setCell` operations in LWW mode

When multiple local `setCell` operations were pending for the same cell and the first was acknowledged, `SharedMatrix` did not update its tracked consensus value to the acknowledged value. On reconnect, rolling back the remaining pending operations could restore a stale value, causing the matrix to diverge between clients. The consensus value is now updated when acking the first of multiple pending writes in last-writer-wins mode.
