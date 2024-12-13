---
"@fluidframework/merge-tree": minor
"@fluidframework/sequence": minor
---
---
"section": deprecation
---

Merge-Tree and SharedString ISegment Deprecations

The current ISegment interface over-exposes a number of properties which do not have an external use case, and any external usage could result in damage to the underlying merge-tree including data corruption.

The only use case that will continue to be supported is determining if a segment is removed. For this purpose we've add the following `function segmentIsRemoved(segment: ISegment): boolean`

For example, checking if a segment is not removed would change as follows:
``` diff
- if(segment.removedSeq === undefined){
+ if(!segmentIsRemoved(segment)){
```

The following properties are deprecated on ISegment and its implementations:
- clientId
- index
- localMovedSeq
- localRefs
- localRemovedSeq
- localSeq
- movedClientsIds
- movedSeq
- movedSeqs
- ordinal
- removedClientIds
- removedSeq
- seq
- wasMovedOnInsert

Additionally, the following types are also deprecated, and will become internal:
- IMergeNodeCommon
- IMoveInfo
- IRemovalInfo
- LocalReferenceCollection
