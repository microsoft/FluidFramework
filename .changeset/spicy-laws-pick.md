---
"@fluidframework/merge-tree": minor
"@fluidframework/sequence": minor
---

Deprecate ICombiningOp, PropertiesRollback.Rewrite, and SharedString.annotateMarkerNotifyConsensus

This change deprecates usage of ICombiningOp in various APIs, including SharedSegmentSequence.annotateRange and SharedString.annotateMarker. It also deprecates SharedString.annotateMarkerNotifyConsensus which is related to combining ops. This functionality had no test coverage and was largely unused.
