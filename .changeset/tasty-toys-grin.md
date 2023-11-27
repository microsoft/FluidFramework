---
"@fluidframework/sequence": minor
---

1. Deprecate API `gatherIterationResults`, `CreateForwardIteratorWithStartPosition`, `CreateBackwardIteratorWithStartPosition`, `CreateForwardIteratorWithEndPosition`, `CreateBackwardIteratorWithEndPosition` from `IntervalCollection`, these functioanlities are moved to the `OverlappingIntervalsIndex`. Users are advised to independently attach the index to the collection and utilize the API accordingly, for instance:

```typescript
// Create and attach the interval index
const overlappingIntervalsIndex = createOverlappingIntervalsIndex(sharedString);
collection.attachIndex(overlappingIntervalsIndex);

// Get the iterator of intervals based on the expected iteration direction and start/end position
const resultIntervalIterator = overlappingIntervalsIndex.createForwardIteratorWithStartPosition(startPosition);

// Get all intervals associated with this interval index
const resultIntervals = [];
overlappingIntervalsIndex.gatherIterationResults(resultIntervals, true);

// Detach the interval index
collection.detachIndex(overlappingIntervalsIndex);
```

2. Remove the utilization of `IntervalCollectionIterator`