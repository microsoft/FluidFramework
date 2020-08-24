## Usage

Like all SharedSequences, you can use the [insert][] and [getItems][] methods to insert and retrieve items from the
sequence, and [remove][] to remove items.

## Eventing

Whenever an operation is performed on a sequence a [sequenceDelta][] event will be raised. This event provides the
ranges affected by the operation, the type of the operation, and the properties that were changed by the operation.

[insert]: {{< relref "/apis/sequence/sharedsequence.md#sequence-sharedsequence-insert-Method" >}}
[getItems]: {{< relref "/apis/sequence/sharedsequence.md#sequence-sharedsequence-getitems-Method" >}}
[remove]: {{< relref "/apis/sequence/sharedsequence.md#sequence-sharedsequence-getitems-Method" >}}
[sequenceDeltaEvent]: {{< relref "/apis/sequence/sequencedeltaevent.md" >}}
