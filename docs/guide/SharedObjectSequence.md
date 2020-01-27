---
uid: SharedObjectSequence
---

# SharedObjectSequence

- Package: [@microsoft/fluid-sequence](../api/fluid-sequence.md)
- API documentation: [SharedObjectSequence](../api/fluid-sequence.SharedObjectSequence.md)

The SharedObjectSequence distributed data structure can be used to store sequences of objects.

## Creation

To create a `SharedObjectSequence`, call the static create method:

```typescript
const mySequence = SharedObjectSequence.create(this.runtime, id);
```

!!!include(sequences-usage.md)!!!

## Related distributed data structures

- [SharedNumberSequence](./SharedNumberSequence.md)
- [SharedString](./SharedString.md)
- [SparseMatrix](./SparseMatrix.md)
