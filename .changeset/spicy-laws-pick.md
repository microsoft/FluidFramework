---
"@fluidframework/merge-tree": minor
"@fluidframework/sequence": minor
---

sequence: Deprecated ICombiningOp, PropertiesRollback.Rewrite, and SharedString.annotateMarkerNotifyConsensus

The `ICombiningOp` and its usage in various APIs has been deprecated. APIs affected include
`SharedSegmentSequence.annotateRange` and `SharedString.annotateMarker`. `SharedString.annotateMarkerNotifyConsensus`
has also been deprecated, because it is related to combining ops. This functionality had no test coverage and was
largely unused.
