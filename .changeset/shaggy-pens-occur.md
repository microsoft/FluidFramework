---
"@fluidframework/merge-tree": minor
"@fluidframework/sequence": minor
---
---
"section": deprecation
---

Several MergeTree `Client` Legacy APIs are now deprecated

To reduce exposure of the `Client` class in the merge-tree package, several types have been deprecated. These types directly or indirectly expose the merge-tree `Client` class.

Most of these types are not meant to be used directly, and direct use is not supported:

 - AttributionPolicy
 - IClientEvents
 - IMergeTreeAttributionOptions
 - SharedSegmentSequence
 - SharedStringClass

Some of the deprecations are class constructors. In those cases, we plan to replace the class with an interface which has an equivalent API. Direct instantiation of these classes is not currently supported or necessary for any supported scenario, so the change to an interface should not impact usage. This applies to the following types:

- SequenceInterval
- SequenceEvent
- SequenceDeltaEvent
- SequenceMaintenanceEvent
