---
"@fluidframework/sequence": minor
"__section": legacy
---
Remove deprecated IntervalCollections types

This change removes the following deprecated generic types and provides non-generic alternatives where necessary:

- `IIntervalCollection` is replaced by `ISequenceIntervalCollection`
- `IIntervalCollectionEvent` is replaced by `ISequenceIntervalCollectionEvents`
- `IntervalIndex` is replaced by `SequenceIntervalIndex`
- `IOverlappingIntervalsIndex` is replaced by `ISequenceOverlappingIntervalsIndex`
- `ISharedIntervalCollection` is deprecated without replacement

These types are no longer required to be generic, and replacing them with non-generic alternatives keeps the typing less complex.
