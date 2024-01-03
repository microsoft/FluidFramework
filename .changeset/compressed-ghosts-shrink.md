---
"@fluidframework/id-compressor": minor
---

This change adjusts the cluster allocation strategy for ghost sessions to exactly fill the cluster instead of needlessly allocating a large cluster.
It will also not make a cluster at all if IDs are not allocated.
This change adjusts a computation performed at a consensus point, and thus breaks any sessions collaborating across version numbers.
