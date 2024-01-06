---
"@fluidframework/id-compressor": minor
---

id-compressor: Cluster allocation strategy updated

This change adjusts the cluster allocation strategy for ghost sessions to exactly fill the cluster instead of needlessly allocating a large cluster.
It will also not make a cluster at all if IDs are not allocated.
This change adjusts a computation performed at a consensus point, and thus breaks any sessions collaborating across version numbers.
The version for the serialized format has been bumped to 2.0, and 1.0 documents will fail to load with the following error:
IdCompressor version 1.0 is no longer supported.
