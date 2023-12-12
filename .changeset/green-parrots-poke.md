---
"@fluidframework/merge-tree": major
"@fluidframework/sequence": major
---

sequence: Removed several public exports from merge-tree and sequence

The following APIs have been removed or marked internal in merge-tree and sequence. This functionality was never
intended for public export.

- BaseSegment.ack
- Client
- CollaborationWindow
- compareNumbers
- compareStrings
- createAnnotateMarkerOp
- createAnnotateRangeOp
- createGroupOp
- createInsertOp
- createInsertSegmentOp
- createRemoveRangeOp
- IConsensusInfo
- IConsensusValue
- IMarkerModifiedAction
- IMergeTreeTextHelper
- LocalClientId
- MergeTreeDeltaCallback
- MergeTreeMaintenanceCallback
- NonCollabClient
- SegmentAccumulator
- SegmentGroup
- SegmentGroupCollection.enqueue
- SegmentGroupCollection.dequeue
- SegmentGroupCollection.pop
- SortedSegmentSet
- SortedSegmentSetItem
- SortedSet
- toRemovalInfo
- TreeMaintenanceSequenceNumber
- UniversalSequenceNumber
- SharedSegmentSequence.submitSequenceMessage
