---
"@fluidframework/sequence": minor
---

1. Deprecate API `findOverlappingIntervals` and `gatherIterationResults` from `IntervalCollection`, these functionalities are moved to the `OverlappingIntervalsIndex`. Users are advised to independently attach the index to the collection and utilize the API accordingly, for instance:

```typescript
const overlappingIntervalsIndex = createOverlappingIntervalsIndex(client, helpers);
collection.attachIndex(overlappingIntervalsIndex)
const result1 = overlappingIntervalsIndex.findOverlappingIntervals(start, end);

const result2 = [];
overlappingIntervalsIndex.gatherIterationResults(result2, true);
```

2. Deprecate API `previousInterval` and `nextInterval` from `IntervalCollection`, these functionalities are moved to the `OverlappingIntervalsIndex`. Users are advised to independently attach the index to the collection and utilize the API accordingly, for instance:

```typescript
const endpointIndex = createEndpointIndex(client, helpers);
collection.attachIndex(endpointIndex);

const result1 = endpointIndex.previousInterval(pos);
const result2 = endpointIndex.nextInterval(pos);
```

3. Deprecate API `CreateBackwardIteratorWithEndPosition`, `CreateBackwardIteratorWithStartPosition`, `CreateForwardIteratorWithEndPosition` and `CreateForwardIteratorWithStartPosition` from `IntervalCollection`. Only the default iterator will be supported in the future, and it will no longer preserve sequence order.

Equivalent functionality to these three methods is provided by `IOverlappingIntervalIndex.gatherIterationResults`.