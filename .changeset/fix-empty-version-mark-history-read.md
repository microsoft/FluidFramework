---
"@fluidframework/container-runtime": minor
"__section": fix
---
Keep version marks pending when historical operations are temporarily unavailable

Version marks are no longer permanently classified as unresolvable when a historical operation read returns no operations.
The runtime keeps the mark pending so it can resolve when the submitted batch becomes visible or sequences live.
