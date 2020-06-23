---
uid: SharedNumberSequence
---

# SharedNumberSequence

- Package: [@fluidframework/sequence](../api/sequence.md)
- API documentation: [SharedNumberSequence](../api/sequence.sharednumbersequence.md)

The SharedNumberSequence distributed data structure can be used to store sequences of numbers.

## Creation

To create a `SharedNumberSequence`, call the static create method:

```typescript
const mySequence = SharedNumberSequence.create(this.runtime, id);
```

!!!include(sequences-usage.md)!!!

## Related distributed data structures

- [SharedObjectSequence][]
- [SharedString][]


!!!include(links.md)!!!
