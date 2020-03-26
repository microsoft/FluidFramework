## Usage

Like all SharedSequences, you can use the [insert](../../api/fluid-sequence.sharedsequence.insert.md) and
[getItems](../../api/fluid-sequence.sharedsequence.getitems.md) methods to insert and retrieve items from the sequence,
and [remove](../../api/fluid-sequence.sharedsequence.remove.md) to remove items.

## Eventing

Whenever an operation is performed on a sequence a [sequenceDelta](../../api/fluid-sequence.sequencedeltaevent.md) event
will be raised. This event provides the ranges affected by the operation, the type of the operation, and the properties
that were changed by the operation.
