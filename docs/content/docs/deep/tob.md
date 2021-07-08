---
title: Total order broadcast & eventual consistency
menuPosition: 2
---

## Fluid Data: Operations all the way down

Fluid data is different than data you might be familiar with. In Fluid, when data is changed, the change is modeled as
an operation (often shortened to op) on the existing data (if you've used [Operational
Transform](https://en.wikipedia.org/wiki/Operational_transformation), this concept may sound familiar).

Operations describe changes to a data structure. By chaining a series of operations together we can represent changes to
a data structure over time (history). This operation is also what we communicate to other clients to share those
changes. When clients receive operations, they apply those operations to their local data.

However, just sending operations is not enough -- we need to be sure that each client applies the operations in the right
order.

Fluid is, at its core, a data model for distributed state. Building collaborative experiences boils down to managing
distributed state, and Fluid provides powerful developer-friendly abstractions for managing this state in the form of
distributed data structures (DDSes). Each of these data structures is eventually consistent -- this means that, assuming
no new changes to the data structures, all clients reach an identical state in a finite amount of time.

Fluid guarantees eventual consistency via total order broadcast. That is, when a DDS is changed locally by a client,
that change -- that is, the operation -- is first sent to the Fluid service, which does three things:

* Assigns a monotonically increasing sequence number to the operation; this is the "total order" part of total order
  broadcast.
* Broadcasts the operation to all other connected clients; this is the "broadcast" part of total order broadcast.
* Stores the operation's data (see [data persistence](#data-persistence)).

This means that each client receives every operation relayed from the server with enough information to apply them in
the correct order. The clients can then apply the operations to their local state -- which means that each client will
eventually be consistent with the client that originated the change.


## Operations

Fluid is also efficient when communicating with the server. When you change a data structure, Fluid doesn't send the
whole data structure to the server. Rather, it sends operations. For example, consider the [SharedNumberSequence][] data
structure. When a client inserts, appends, or deletes items in the sequence, Fluid sends the server the operation that
was performed and the data that was inserted/appended/etc. When the Fluid service broadcasts the operation to all the
other connected clients, it again sends only the operation itself, not the full data structure. This efficiency in
bytes-over-wire helps both performance and bandwidth.

## Data persistence

The Fluid service is responsible for storing ops and their accompanying data. It's important that the server stores the
ops themselves, because in order for a new client to sync their local state to the state of all the other clients, the
new client needs to retrieve ops from the server to apply locally. When a new client connects, the server will send it
all necessary ops (more precisely, the client will request the ops from the server) to bring it to a consistent state
with all other clients. This is managed by the Fluid runtime.

## Summary operations

As the number of operations increases, replaying all ops when loading a Fluid data structure is inefficient. Fluid
provides a specialized operation, called a Summary operation, to address this. As the name implies, a Summary op is an
operation that summarizes all previous operations. Thus, a Summary op represents the state of Fluid data structures at a
particular sequence number.

When a client boots, rather than loading all ops, the client can load the most recent Summary op, making the local Fluid
data structures consistent with the rest of the clients. Summary ops, like all Fluid operations, are created by the
client. The Fluid runtime will automatically create summaries at opportune moments. The Summary op is created by a
single client selected from the connected clients.

The Summary op is unique in that it is ignored by connected clients. The Summary op is primarily a message to the Fluid
server that it needs to store a new summary. If the operation is valid, then the server will commit the summary to
storage and broadcast an event to the connected clients acknowledging that the summary was stored. In normal operation
the clients will ignore both the summary op itself and the acknowledgement, since connected clients already receive all
ops and are thus already consistent.

Summary ops summarize the state of distributed data structures, so Fluid objects (which are a collection of distributed
data structures) don't need to do anything to participate in summarization; it happens automatically, and all
Fluid objects' data structures will be summarized.

<!-- AUTO-GENERATED-CONTENT:START (INCLUDE:path=_includes/links.md) -->
<!-- Links -->

<!-- Concepts -->

[Fluid container]: {{< relref "containers-runtime.md" >}}

<!-- Packages -->

[Aqueduct]: {{< relref "/docs/apis/aqueduct.md" >}}
[fluid-framework]: {{< relref "/docs/apis/fluid-framework.md" >}}

<!-- Classes and interfaces -->

[ContainerRuntimeFactoryWithDefaultDataStore]: {{< relref "/docs/apis/aqueduct/containerruntimefactorywithdefaultdatastore.md" >}}
[DataObject]: {{< relref "/docs/apis/aqueduct/dataobject.md" >}}
[DataObjectFactory]: {{< relref "/docs/apis/aqueduct/dataobjectfactory.md" >}}
[Ink]: {{< relref "/docs/apis/ink/ink.md" >}}
[PureDataObject]: {{< relref "/docs/apis/aqueduct/puredataobject.md" >}}
[PureDataObjectFactory]: {{< relref "/docs/apis/aqueduct/puredataobjectfactory.md" >}}
[Quorum]: {{< relref "/docs/apis/protocol-base/quorum.md" >}}
[SharedCell]: {{< relref "/docs/apis/cell/sharedcell.md" >}}
[SharedCounter]: {{< relref "SharedCounter" >}}
[SharedDirectory]: {{< relref "/docs/apis/map/shareddirectory.md" >}}
[SharedMap]: {{< relref "/docs/apis/map/sharedmap.md" >}}
[SharedMatrix]: {{< relref "SharedMatrix" >}}
[SharedNumberSequence]: {{< relref "SharedNumberSequence" >}}
[SharedObjectSequence]: {{< relref "/docs/apis/sequence/sharedobjectsequence.md" >}}
[SharedSequence]: {{< relref "SharedSequence" >}}
[SharedString]: {{< relref "SharedString" >}}

<!-- Sequence methods -->

[sequence.insert]: {{< relref "/docs/apis/sequence/sharedsequence.md#sequence-sharedsequence-insert-Method" >}}
[sequence.getItems]: {{< relref "/docs/apis/sequence/sharedsequence.md#sequence-sharedsequence-getitems-Method" >}}
[sequence.remove]: {{< relref "/docs/apis/sequence/sharedsequence.md#sequence-sharedsequence-getitems-Method" >}}
[sequenceDeltaEvent]: {{< relref "/docs/apis/sequence/sequencedeltaevent.md" >}}

<!-- AUTO-GENERATED-CONTENT:END -->
