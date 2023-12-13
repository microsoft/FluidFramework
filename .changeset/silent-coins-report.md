---
"@fluidframework/merge-tree": major
"@fluidframework/sequence": major
---

sequence: Remove support for combining ops

In sequence, removed the following APIs:

- the `combiningOp` argument from `SharedSegmentSequence.annotateRange` and `SharedString.annotateMarker`
- the function `SharedString.annotateMarkerNotifyConsensus`

In merge-tree, removed the following APIs:

- `ICombiningOp`
- the `combiningOp` field from `IMergeTreeAnnotateMsg`
- the `op` argument from `BaseSegment.addProperties`, `PropertiesManager.addProperties`, and `ReferencePosition.addProperties`
- the enum variant `PropertiesRollback.Rewrite`.

This functionality was largely unused and had no test coverage.
