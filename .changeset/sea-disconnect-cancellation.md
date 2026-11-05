---
"@fluidframework/sea-tree": minor
"__section": fix
"__includeInReleaseNotes": false
---
Avoid stale transport errors after intentional disconnection

Cancelled background summaries and delayed cleanup from older connections no longer overwrite the direct host's current error state or summary retry schedule.
Failures in the current connection remain visible.
