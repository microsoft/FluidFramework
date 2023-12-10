---
"@fluidframework/sequence": minor
"@fluid-experimental/sequence-deprecated": minor
---

Deprecate API `previousInterval` and `nextInterval` from `IntervalCollection`, these functionalities are moved to the `EndpointIndex`. Users are advised to independently attach the index to the collection and utilize the API accordingly, for instance:

```typescript
const endpointIndex = createEndpointIndex(sharedString);
collection.attachIndex(endpointIndex);

const result1 = endpointIndex.previousInterval(pos);
const result2 = endpointIndex.nextInterval(pos);
```
