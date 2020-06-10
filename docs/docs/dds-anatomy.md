# Anatomy of a distributed data structure

## Intent

Although all Distributed Data Structures (DDSs) will have unique characteristics, they will all necessarily share some
broad commonalities in their overall structure and function. This document intends to outline those areas to describe
DDSs at one level of depth below the surface. This description may be useful in introducing the concept of DDSs to
developers for the first time.

## Overview

The major qualities of a DDS are:

1. Local representation
1. Op vocabulary
1. Data serialization format (op)
1. Data serialization format (summary operations)
1. Reaction to remote changes
1. Conflict resolution strategies

Although this document uses the current implementations in Fluid as examples and evidence of these qualities, these
qualities would generally be the same even if the underlying implementation is changes.

## Local representation

Just like any non-distributed data structure, all DDSs must also be accessible on the client with an in-memory
representation via a public API surface. The developer operates on and reads from this in-memory structure similarly to
any other non-distributed data structure. The particular format of the data and functionality of the API will vary
between data structures. For example, a SharedMap holds key:value data and provides interfaces like get and set for
reading and updating values in the map. This is very similar to the native (non-distributed) Map in JS.

## Op vocabulary

As the in-memory representation is modified on one client, we need to notify other clients of the updates. Most DDSs
will have multiple operations that can be performed, so we'll need to differentiate the types of notifications (ops)
we're sending. For example, a SharedMap might be modified through "set", "delete", or "clear".

These ops will probably correspond loosely with specific APIs on the DDS that cause data modification with the
expectation that there is a 1:1:1 correspondence between that API call on client A, the op that is sent, and the
corresponding API being called on client B. However, this correspondence is not mandatory.

## Data serialization format (op)

Frequently, ops will need to carry a data payload. For example, when performing a "set" on a SharedMap, the new
key:value pair needs to be communicated to other clients. As a result, DDSs will have some serialization format for op
data payloads that can be reconstituted on the receiving end.

## Data serialization format (summary operations)

In addition to serializing for ops, DDSs should be able to serialize their entire contents into a format that can be
used to reconstruct the DDS. This format is used for summary operations. There may be some overlap with the
serialization format used in ops, but it isn't strictly necessary.

## Reaction to remote changes

As compared to their non-shared counterparts, DDSs can change state without the developer's awareness as remote ops are
received. For instance, a standard JS Map will never change values without the local client calling a method on it, but
a SharedMap needs to effectively accept calls from other clients. To make the local client aware of the update, DDSs
must expose a means for the local client to observe and respond to these changes. This probably takes the form of
eventing, but could reasonably also take the form of callback functions that integrate into the processing step, etc.

::: danger TODO

Add link to event documentation

:::

## Conflict resolution strategies

Data structures must be aware that multiple clients can act on the structure remotely, and the propagation of those
changes take time. It's possible then for a client to make a change to a data structure while unaware of its most-recent
state. The data structure must incorporate strategies for handling these scenarios such that any two clients which have
received the same set of ops will agree on the state. This property is referred to as "eventual consistency" or
"[convergence](https://en.wikipedia.org/wiki/Operational_transformation#The_CC_model)". These strategies may be varied
depending on the specific operation even within a single DDS. Some (non-exhaustive) examples of valid strategies:

### Conflict avoidance

Some data structures may not need to worry about conflict because their nature makes it impossible. For instance, an
OwnedSharedMap only permits a single user (the owner) to make modifications to the data, and all other clients are
read-only. Characteristics of data structures that can take this approach:

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

More-advanced DDSs require a more-sophisticated conflict resolution strategy to meet user expectations. The general
principle is referred to as [Intention
Preservation](https://en.wikipedia.org/wiki/Operational_transformation#The_CCI_model). For example, the text I insert at
position 23 of a SharedString while a friend deletes at position 12 needs to be transformed to insert at the location
that matches my intention (that is, remains in the same location relative to the surrounding text, not the numerical
index).

## Additional thoughts

1. Strictly speaking, summarization doesn't have to be a requirement of a DDS. If the ops are retained, the DDS should
   be able to be reconstructed from those. However, it seems likely that most DDS implementations would want
   summarization functionality for performance reasons, and server implementations can benefit from reduced storage
   needs.
2. This document doesn't currently cover the transmission of ops or stamping them with a sequence number, but that
   probably belongs here since it's something a developer working on DDSs must be aware of (e.g. in conflict
   resolution). It is external to the DDS itself though.
3. A section on allowances on "benign/allowable/by-design inconsistency" might be interesting. For example:
   - SharedString can be represented differently across clients in internal in-memory representation depending on op
     order, but this discrepancy is invisible to the user of the SharedString DDS.
   - SharedMap will raise a different number of valueChanged events across clients when simultaneous sets occur. the
     client that set last will get a single valueChanged event, while earlier setters will get an additional event for
     each set after their own.
