---
uid: SharedObjectSequence
---

# SharedObjectSequence

- Package: <xref:@prague/sequence!>
- API documentation: <xref:@prague/sequence!SharedObjectSequence:class>

The SharedObjectSequence distributed data structure can be used to store sequences of objects.

## Creation

To create a `SharedObjectSequence`, call the static create method:

```typescript
const mySequence = SharedObjectSequence.create(this.runtime, id);
```

## Usage

Like all SharedSequences, you can use the <xref:@prague/sequence!SharedSequence%23insert:member(1)> and
<xref:@prague/sequence!SharedSequence%23getItems:member(1)> methods to insert and retrieve items from the sequence, and
<xref:@prague/sequence!SharedSequence%23remove:member(1)> to remove items.

[!INCLUDE [object-serialization](../includes/object-serialization.md)]

## Eventing

- [valueChanged](<xref:@prague/sequence!SharedSegmentSequence%23on:member(3)>)

## Related distributed data structures

- <xref:SharedNumberSequence>
