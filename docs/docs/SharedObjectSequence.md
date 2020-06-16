---
uid: SharedObjectSequence
---

# SharedObjectSequence

- Package: [@fluidframework/sequence](../api/sequence.md)
- API documentation: [SharedObjectSequence](../api/sequence.sharedobjectsequence.md)

The SharedObjectSequence distributed data structure can be used to store sequences of objects.

## Creation

To create a `SharedObjectSequence`, call the static create method:

```typescript
const mySequence = SharedObjectSequence.create(this.runtime, id);
```

!!!include(sequences-usage.md)!!!

## Related distributed data structures

- [SharedNumberSequence][]
- [SharedString][]


!!!include(links.md)!!!
