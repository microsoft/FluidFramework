---
"fluid-framework": minor
"@fluidframework/sequence": minor
---
---
"section": deprecation
---

Replace generic types for IntervalCollections non-generic types

This change deprecates the following generic types and provides non-generic alternatives where necessary:

- `IIntervalCollection` is replaced by `ISequenceIntervalCollection`
- `IIntervalCollectionEvent` is replaced by `ISequenceIntervalCollectionEvents`
- `IntervalIndex` is replaced by `SequenceIntervalIndex`
- `IOverlappingIntervalsIndex` is replaced by `ISequenceOverlappingIntervalsIndex`
- `ISharedIntervalCollection` is deprecated without replacement

These types are no longer required to be generic, and replacing them with non-generic alternatives keeps our typing less complex.
