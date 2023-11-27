---
"@fluidframework/merge-tree": major
"@fluidframework/sequence": major
---

Remove support for combining ops

In `merge-tree`, removes ICombiningOp; the combiningOp field from IMergeTreeAnnotateMsg; the op argument from BaseSegment.addProperties, PropertiesManager.addProperties, and ReferencePosition.addProperties; and the enum variant PropertiesRollback.Rewrite.

In `sequence`, removes the combiningOp argument from SharedSegmentSequence.annotateRange and SharedString.annotateMarker and the function SharedString.annotateMarkerNotifyConsensus.

This functionality was largely unused and had no test coverage.
