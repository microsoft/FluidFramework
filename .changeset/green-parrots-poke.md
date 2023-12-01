---
"@fluidframework/merge-tree": major
"@fluidframework/sequence": major
---

Remove public exports from merge-tree and sequence

Removes or marks `@internal` BaseSegment.ack, Client, CollaborationWindow, compareNumbers, compareStrings, createAnnotateMarkerOp, createAnnotateRangeOp, createGroupOp, createInsertOp, createInsertSegmentOp, createRemoveRangeOp, IConsensusInfo, IConsensusValue, IMarkerModifiedAction, IMergeTreeTextHelper, LocalClientId, MergeTreeDeltaCallback, MergeTreeMaintenanceCallback, NonCollabClient, SegmentAccumulator, SegmentGroup, SegmentGroupCollection.enqueue, SegmentGroupCollection.dequeue, SegmentGroupCollection.pop, SortedSegmentSet, SortedSegmentSetItem, SortedSet, toRemovalInfo, TreeMaintenanceSequenceNumber, and UniversalSequenceNumber from merge-tree.

Removes SharedSegmentSequence.submitSequenceMessage from sequence.

This functionality was never intended for public export.
