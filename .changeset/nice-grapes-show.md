---
"@fluidframework/merge-tree": minor
"@fluidframework/sequence": minor
---
---
"section": legacy
---

Remove deprecated Merge-Tree and SharedString ISegment members

The current ISegment interface over-exposes a number of properties which do not have an external use case, and any external usage could result in damage to the underlying merge-tree including data corruption.
[In Fluid Framework release 2.12.0 these properties and associated types were deprecated.](https://github.com/microsoft/FluidFramework/blob/main/RELEASE_NOTES/2.12.0.md#merge-tree-and-sharedstring-isegment-deprecations-23323)

The only use case that will continue to be supported is determining if a segment is removed. For this purpose we've added the free function `segmentIsRemoved(segment: ISegment): boolean`.

For example, checking if a segment is not removed would change as follows:

```diff
- if(segment.removedSeq === undefined){
+ if(!segmentIsRemoved(segment)){
```

The following properties are removed from ISegment and its implementations:

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

Additionally, the following types are also removed:

- IMergeNodeCommon
- IMoveInfo
- IRemovalInfo
- LocalReferenceCollection
