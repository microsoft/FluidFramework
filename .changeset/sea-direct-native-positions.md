---
"@fluidframework/sea-tree": minor
"@fluidframework/sea-driver": minor
"__section": fix
"__includeInReleaseNotes": false
---
Use native SEA positions for direct SharedTree loading and recovery

The direct host bypasses Fluid sequence projection and reads only operations after its snapshot or reconnect cursor.
It converts SEA positions and references to JavaScript safe integers with assertions against precision loss.
Version 2 snapshots omit position-mapping tables; older direct snapshots are explicitly rejected.
