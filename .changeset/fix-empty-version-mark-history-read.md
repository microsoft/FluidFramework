---
"@fluidframework/container-runtime": minor
"@fluidframework/runtime-definitions": minor
"__section": fix
---
Keep unresolved version marks pending when history is inconclusive

Version marks are no longer permanently classified as unresolvable when a historical operation read is empty or starts
after the mark's sequence-number lower bound.
Neither result proves that the specific batch sequenced in the unavailable range.
The runtime keeps the mark pending so a disconnected or resubmitted batch can still sequence and resolve later.
Hosts own retry suppression and expiration policy for long-lived pending marks.
