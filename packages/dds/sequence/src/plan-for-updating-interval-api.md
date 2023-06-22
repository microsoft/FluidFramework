# Refactoring/Deprecating Interval-related API

## Refactoring


1. Keep the IntervalCollection related contents in the current file, it includes:

- `IntervalCollection`: Collection of intervals that supports addition, modification, removal, and efficient spatial querying.

- `LocalIntervalCollection`

- `IIntervalCollectionEvent`

- `IntervalCollectionIterator`

- All corresponding interfaces and helper functions for `IntervalCollection`

2.  Create a new folder for Intervals-related components

- `intervalInterfaces`: stores the generic interval interface (`IInterval`), `ISerializedInterval`, `ISerializableInterval`

- `Interval`: Implementation of the `ISerializableInterval`, whose endpoints are plain-old numbers

- `SequenceInterval`: Implementation of the `ISerializableInterval`, whose ends are associated with positions in a mutatable sequence.

3. Create a new folder for IntervalIndex-related components

- `intervalIndexInterfaces`: stores the generic intervalIndex interface (`IIntervalIndex`), `IOverlappingIntervalsIndex`, `IStartpointInRangeIndex`, `IEndpointInRangeIndex`, and etc.

- `StartpointInRangeIndex`

- `EndpointInRangeIndex`

- `OverlappingIntervalsIndex`

- `OverlappingSequenceIntervalsIndex`

- `SequenceIntervalIndexes`: store the namespace contains specialiazations of indexes which support spatial queries specifically for `SequenceInterval`.

4. Move `IntervalCollectionFactory` and `SequenceIntervalCollectionFactory` to separate files, which are responsible for creating instances of various types of IntervalCollection

The files hierarchy is supposed to be:

```
├── IntervalCollection
├── Interval
│   ├── intervalInterfaces
│   ├── Interval
│   └── SequenceInterval
├── IntervalIndex
│   ├── intervalIndexInterfaces
│   ├── startpointInRangeIndex
│   ├── endpointInRangeIndex
│   ├── overlappingIntervalsIndex
│   ├── overlappingSequenceIntervalsIndex
│   └── sequenceIntervalIndexes
├── IntervalCollectionFactory
├── SequenceIntervalCollectionFactory
└── ... (other exisiting files)
```

## Deprecation

1. Depreacate the unnecessary API

- `SharedIntervalCollection` is not maintained and is planned to be removed

- `IntervalConflictResolver` in `IntervalTree` and `addConflictResolver` in `intervalCollection` are never invoked and no longer needed, since interval collections support multiple intervals at the same location and gives each interval a unique id.

- `propertyManager` of `Interval` and `SequenceInterval` is no longer needed

2. Mark below API's as internal

- `union`, `addProperties`, `modify` of `Interval` and `SequenceInterval` are never intended to be public

3. The `idIntervalIndex` and `endIntervalIndex` were never used explicity, should we remove them from the `LocalIntervalCollection`?

```typescript
export class LocalIntervalCollection<TInterval extends ISerializableInterval> {
	private static readonly legacyIdPrefix = "legacy";
	public readonly overlappingIntervalsIndex: OverlappingIntervalsIndex<TInterval>;
	public readonly idIntervalIndex: IdIntervalIndex<TInterval>;
	public readonly endIntervalIndex: EndpointIndex<TInterval>;
	private readonly indexes: Set<IntervalIndex<TInterval>>;
	...
}
```