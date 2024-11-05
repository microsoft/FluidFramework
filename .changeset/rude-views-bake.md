---
"fluid-framework": minor
"@fluidframework/merge-tree": minor
"@fluidframework/sequence": minor
---
---
"section": deprecation
---

MergeTree `Client` Legacy API Removed

The `Client` class in the merge-tree package has been removed. Types that directly or indirectly expose the merge-tree `Client` class have also been removed.

The removed types were not meant to be used directly, and direct usage was not supported:

- AttributionPolicy
- IClientEvents
- IMergeTreeAttributionOptions
- SharedSegmentSequence
- SharedStringClass

Some classes that referenced the `Client` class have been transitioned to interfaces. Direct instantiation of these classes was not supported or necessary for any supported scenario, so the change to an interface should not impact usage. This applies to the following types:

- SequenceInterval
- SequenceEvent
- SequenceDeltaEvent
- SequenceMaintenanceEvent

The initial deprecations of the now changed or removed types were announced in Fluid Framework v2.4.0:
[Several MergeTree Client Legacy APIs are now deprecated](https://github.com/microsoft/FluidFramework/blob/main/RELEASE_NOTES/2.4.0.md#several-mergetree-client-legacy-apis-are-now-deprecated-22629)
