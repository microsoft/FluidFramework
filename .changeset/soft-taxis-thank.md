---
"@fluidframework/sequence": minor
---

sequence: Deprecated previousInterval and nextInterval APIs

The `previousInterval` and `nextInterval` APIs from `IntervalCollection` have been deprecated. These functions are moved
to the `EndpointIndex`. Users should independently attach the index to the collection and utilize the API accordingly,
for instance:

```typescript
const endpointIndex = createEndpointIndex(sharedString);
collection.attachIndex(endpointIndex);

const result1 = endpointIndex.previousInterval(pos);
const result2 = endpointIndex.nextInterval(pos);
```
