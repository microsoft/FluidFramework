## Usage

Like all SharedSequences, you can use the [insert](../api/sequence.sharedsequence.insert.md) and
[getItems](../api/sequence.sharedsequence.getitems.md) methods to insert and retrieve items from the sequence,
and [remove](../api/sequence.sharedsequence.remove.md) to remove items.

## Eventing

Whenever an operation is performed on a sequence a [sequenceDelta](../api/sequence.sequencedeltaevent.md) event
will be raised. This event provides the ranges affected by the operation, the type of the operation, and the properties
that were changed by the operation.
