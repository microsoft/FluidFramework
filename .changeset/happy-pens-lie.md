---
"@fluidframework/sequence": minor
"@fluid-private/test-end-to-end-tests": minor
---

Deprecate API `findOverlappingIntervals` from `IntervalCollection`, this functionality is moved to the `OverlappingIntervalsIndex`. Users are advised to independently attach the index to the collection and utilize the API accordingly, for instance:

```typescript
const overlappingIntervalsIndex = createOverlappingIntervalsIndex(sharedString);
collection.attachIndex(overlappingIntervalsIndex)
const result = overlappingIntervalsIndex.findOverlappingIntervals(start, end);
```