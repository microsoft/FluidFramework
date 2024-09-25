---
"@fluidframework/merge-tree": minor
"@fluidframework/sequence": minor
---
---
"section": deprecation
---

Further MergeTree Client Legacy Deprecations

In an effort the reduce exposure of the Client class in the merge-tree package this change additionally deprecates a number of types which either directly or indirectly expose the merge-tree Client class.

Most of these types are not meant to be used directly, and direct use is not supported:
 - AttributionPolicy
 - IClientEvents
 - IMergeTreeAttributionOptions
 - SharedSegmentSequence
 - SharedStringClass

Some of the deprecations are for class constructors and in those cases we plan to replace the class with an interface which has an equivalent API. Direct instantiation of these classes is not currently supported or necessary for any supported scenario, so the change to an interface should not impact usage:
- SequenceInterval
- SequenceEvent
- SequenceDeltaEvent
- SequenceMaintenanceEvent
