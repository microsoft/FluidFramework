## Usage

Like all SharedSequences, you can use the [insert][sequence.insert] and [getItems][sequence.getItems] methods to insert
and retrieve items from the sequence, and [remove][sequence.remove] to remove items.

## Eventing

Whenever an operation is performed on a sequence a [sequenceDeltaEvent][] will be raised. This event provides the
ranges affected by the operation, the type of the operation, and the properties that were changed by the operation.
