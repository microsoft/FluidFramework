---
title: Anatomy of a distributed data structure
menuPosition: 6
---

Although each distributed data structure (DDS) has its own unique functionality, they all share some broad traits.
Understanding these traits is the first step to understanding how DDSes work.  They are:

1. Local representation
1. Op vocabulary
1. Data serialization format (op)
1. Data serialization format (summary operations)
1. Reaction to remote changes
1. Conflict resolution strategies

## Local representation

Just like any non-distributed data structure such as JavaScript's Map object, all DDSes must also be accessible on the
client with an in-memory representation via a public API surface. A developer using the DDS operates on and reads from
this in-memory structure similarly to any other non-distributed data structure. The particular format of the data and
functionality of the API will vary between data structures. For example, a SharedMap holds key:value data and provides
interfaces like get and set for reading and updating values in the map. This is very similar to the native
(non-distributed) Map object in JS.

## Op vocabulary

As the in-memory representation is modified on one client, we need to notify other clients of the updates. Most DDSes
will have multiple operations that can be performed, so we'll need to differentiate the types of notifications (ops)
we're sending. For example, a SharedMap might be modified through "set", "delete", or "clear".

These ops will probably correspond loosely with specific APIs on the DDS that cause data modification with the
expectation that there is a 1:1:1 correspondence between that API call on client A, the op that is sent, and the
corresponding update being applied on client B. However, this correspondence is not mandatory.

## Data serialization format (op)

Frequently, ops will need to carry a data payload. For example, when performing a "set" on a SharedMap, the new
key:value pair needs to be communicated to other clients. As a result, DDSes will have some serialization format for op
data payloads that can be reconstituted on the receiving end. This is why SharedMap requires its keys to be strings and
values to be serializable - non-serializable keys or values can't be transmitted to other clients.

## Data serialization format (summary operations)

Although the state of a DDS can be reconstructed by playing back every op that has ever been applied to it, this becomes
inefficient as the number of ops grows. Instead, DDSes should be able to serialize their entire contents into
a format that clients can use to reconstruct the DDS without processing the entire op history. There may be some overlap
with the serialization format used in ops, but it isn't strictly necessary. For instance, the SharedMap uses the same
serialization format for key/value pairs in its summary as it does in its set ops, but the Ink DDS serializes individual
coordinate updates in its ops while serializing entire ink strokes in its summary.

## Reaction to remote changes

As compared to their non-distributed counterparts, DDSes can change state without the developer's awareness as remote
ops are received. A standard JS Map will never change values without the local client calling a method on it, but a
SharedMap will, as remote clients modify data. To make the local client aware of the update, DDSes must expose a means
for the local client to observe and respond to these changes. This is typically done through eventing, like the
"valueChanged" event on SharedMap.

## Conflict resolution strategies

Data structures must be aware that multiple clients can act on the structure remotely, and the propagation of those
changes take time. It's possible then for a client to make a change to a data structure while unaware of its most-recent
state. The data structure must incorporate strategies for handling these scenarios such that any two clients which have
received the same set of ops will agree on the state. This property is referred to as "eventual consistency" or
"[convergence](https://en.wikipedia.org/wiki/Operational_transformation#The_CC_model)". These strategies may be varied
depending on the specific operation even within a single DDS. Some (non-exhaustive) examples of valid strategies:

### Conflict avoidance

Some data structures may not need to worry about conflict because their nature makes it impossible. For instance, the
Counter DDS increment operations can be applied in any order, since end result of the addition will be the same.
Characteristics of data structures that can take this approach:

1. The data structure somehow ensures no data can be acted upon simultaneously by multiple users (purely additive,
   designated owner, etc.)
1. The order in which actions are taken is either guaranteed (single actor, locking, etc.) or is irrelevant to the
   scenario (incrementing a counter, etc.)

### Last wins

If it's possible to cause conflicts in the data, then a last-wins strategy may be appropriate. This strategy is used by
SharedMap, for example, in the case that multiple clients attempt to set the same key. In this case, clients need to be
aware that their locally applied operations may actually be chronologically before or after unprocessed remote
operations. As remote updates come in, each client needs to update the value to reflect the last (chronologically) set
operation.

### Operational Transform and Intention Preservation

More-advanced DDSes require a more-sophisticated conflict resolution strategy to meet user expectations. The general
principle is referred to as [Intention
Preservation](https://en.wikipedia.org/wiki/Operational_transformation#The_CCI_model). For example, the text I insert at
position 23 of a SharedString while a friend deletes at position 12 needs to be transformed to insert at the location
that matches my intention (that is, remains in the same location relative to the surrounding text, not the numerical
index).

### Consensus and quorum

Some resolution strategies may not be satisfied with eventual consistency, and instead require stronger guarantees
about the global state of the data.  The consensus data structures achieve this by accepting a delay of a roundtrip
to the server before applying any changes locally (thus allowing them to confirm their operation was applied on a
known data state).  The quorum offers an even stronger guarantee (with a correspondingly greater delay), that the
changes will not be applied until all connected clients have accepted the modification.  These delays generally aren't
acceptable for real-time interactivity, but can be useful for scenarios with more lenient performance demands.

## Additional thoughts

1. Strictly speaking, summarization isn't a mandatory requirement of a DDS. If the ops are retained, the DDS can
   be reconstructed from those. However, in practice it is not practical to load from ops alone, as this will
   degrade load time over the lifetime of the DDS.
1. The requirement of "eventual consistency" has some flexibility to it.  Discrepancies between clients are allowed as
   long as they don't result in disagreements between clients on the observable state of the data. For example:
   - SharedString can be represented differently across clients in internal in-memory representation depending on op
     order, but this discrepancy is invisible to the user of the SharedString DDS.
   - SharedMap will raise a different number of valueChanged events across clients when simultaneous sets occur. the
     client that set last will get a single valueChanged event, while earlier setters will get an additional event for
     each set after their own.
