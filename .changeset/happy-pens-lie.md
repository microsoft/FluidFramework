---
"@fluidframework/sequence": minor
---

sequence: Deprecated findOverlappingIntervals API

The `findOverlappingIntervals` API from `IntervalCollection` has been deprecated. This functionality is moved to the
`OverlappingIntervalsIndex`. Users should independently attach the index to the collection and utilize the API
accordingly, for instance:

```typescript
const overlappingIntervalsIndex = createOverlappingIntervalsIndex(sharedString);
collection.attachIndex(overlappingIntervalsIndex)
const result = overlappingIntervalsIndex.findOverlappingIntervals(start, end);
```
