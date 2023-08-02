---
"@fluidframework/sequence": minor
---

Some interval-related APIs are deprecated

The following APIs are now deprecated from `IntervalCollection`:

- `findOverlappingIntervals` and `gatherIterationResults` - these functions are moved to
  the `OverlappingIntervalsIndex`. Users are advised to independently attach the index to the collection and utilize the
  API accordingly, for instance:

  ```typescript
  const overlappingIntervalsIndex = createOverlappingIntervalsIndex(client, helpers);
  collection.attachIndex(overlappingIntervalsIndex)
  const result1 = overlappingIntervalsIndex.findOverlappingIntervals(start, end);

  const result2 = [];
  overlappingIntervalsIndex.gatherIterationResults(result2, true);
  ```

- `CreateBackwardIteratorWithEndPosition`, `CreateBackwardIteratorWithStartPosition`,
  `CreateForwardIteratorWithEndPosition` and `CreateForwardIteratorWithStartPosition` - only the default iterator will be
  supported in the future, and it will no longer preserve sequence order.

  Equivalent functionality to these four methods is provided by `IOverlappingIntervalIndex.gatherIterationResults`.

- `previousInterval` and `nextInterval` - These functionalities are moved to the `EndpointIndex`. Users are advised to
  independently attach the index to the collection and utilize the API accordingly, for instance:

  ```typescript
  const endpointIndex = createEndpointIndex(client, helpers);
  collection.attachIndex(endpointIndex);

  const result1 = endpointIndex.previousInterval(pos);
  const result2 = endpointIndex.nextInterval(pos);
  ```
