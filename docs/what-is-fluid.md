---
uid: what-is-fluid
ms.topic: overview
sidebar: auto
---

# What is the Fluid Framework?

The Fluid Framework is a core developer technology and application platform for building a new class of shared,
interactive experiences on the Web. It will change the way people work through three core capabilities:

1. An innovative model for **distributed data** that will allow 'multi-person' real-time collaboration on Web and document
   content at a speed and scale not yet achieved in the industry.
2. A **componentized document model** that allows authors to deconstruct content into collaborative building blocks,
   **use them across applications**, and combine them in a new, more flexible kind of document.
3. Enabling intelligent agents to work alongside humans in ways that will dramatically increase productivity and what
   people can accomplish

## What problems does the Fluid Framework address?

It is easiest to understand Fluid by examining the problems that it helps address. Namely, that it is challenging, with
the tools available today, to build collaborative experiences on the Web. A canonical example is co-authoring a document
or a presentation. A smaller example is the animated "typing..."  indicator that is common in real-time chat apps (e.g.
Facebook, Slack, Teams).

Increasingly these collaborative experiences are "table stakes" for building Web-based experiences. However, despite
their importance, collaborative experiences can be difficult to build. It might be easy enough to show a "John is
typing" indicator since it has some simplifying constraints like the fact that the indicator is "read-only"; each client
can only write to the main chat stream and its own "typing" indicator.

But many practical scenarios, such as the canonical "co-authoring a document" scenario, involve more complex data that
is being updated by multiple clients, which increases complexity dramatically. Maintaining performance in such
situations is difficult. When multiple clients are manipulating the same data, it quickly becomes difficult to ensure
all clients are seeing the same consistent view of the data.

The way our industry-standard tools work today, if you want to build a collaborative experience – or more likely – add
some collaborative interactivity to an existing experience, you'll have to build quite a bit of infrastructure. For
example, you will likely need to use Web Sockets to keep clients updated quickly, you'll design a messaging protocol,
develop complex merge logic, you'll probably need a distributed cache, etc.

And you'll do this every time you need to build a collaborative experience, because the tools we use today are built for
a "one user at a time" world. Often you must build your collaborative experiences on top of foundations that aren't
themselves collaborative.

The Web is no longer a one user at a time world – if it ever was – and in order to build experiences that feel right for
the collaborative Web, we need tools that understand the collaborative world in which we live. It must become easier to
build and maintain these experiences to push the Web forward.

## Fluid Framework – Layered System

Fluid makes building collaborative experiences on the Web easier while simultaneously addressing the reasons many
collaborative experiences are poor. It addresses performance, complexity of working with distributed state,
componentization of data and UX, intelligent agents, and many other elements in modern applications.

Below is a diagram showing the full 'Fluid Tech Stack', followed by a description of each layer:

::: danger TODO

Diagram

:::

### Fluid Framework Distributed System - Total Order Broadcast & Eventual Consistency

Fluid is, at its core, a data model for distributed state. Building collaborative experiences boils down to managing
distributed state, and Fluid provides powerful developer-friendly abstractions for managing this state in the form of
distributed data structures. Each of these data structures is eventually consistent – this means that, assuming no new
changes to the data structures, all clients reach an identical state in a finite amount of time.

Fluid guarantees eventual consistency via total order broadcast. That is, when a Distributed Data Structure (DDS) is
changed locally by a client, that change – that is, the operation – is first sent to the Fluid server, which does three
things:

Assigns a monotonically increasing sequence number to the operation; this is the "total order" part of total order broadcast
Broadcasts the operation to all other connected clients; this is the "broadcast" part of total order broadcast
Stores the operation's data

This means that each client can apply every operation from the server to their local state in the same order, which in
turn means that each client will eventually be consistent with the client that originated the change.

The quality of eventual consistency improves performance because local changes can be made optimistically, knowing that
the Fluid runtime will merge the change in the appropriate way eventually. And because the system is operations-based,
it will be possible to build a wide range of capabilities including rich version history, attribution, data validation,
'time travel' within a document, and much more.

[Read more about total order broadcast and eventual consistency](./how/tob.md)

### Distributed Data Structures

Much of Fluid's power lies in a set of base primitives called distributed data structures. These data structures, such
as such as SharedMap and SharedString, are eventually consistent. The Fluid runtime manages these data structures; as
changes are made locally and remotely, they are merged in seamlessly by the runtime.

When you're working with a DDS, you can largely treat it as a local object. You can make changes to it as needed.
However, this local object can be changed not only by your local code, but also by the Fluid runtime. The Fluid runtime
is responsible for inbounding changes from the server and then replaying those changes locally. This means your code
should be structured to react to changes to the DDS instances and update accordingly.

As you make changes to the local DDS instance, the changes are sent to the Fluid server. Other clients are notified of
the change - or they can query the server for changes - and then merge the changes in locally. All of this is managed by
the Fluid runtime.

### Fluid Runtime and Component Model

Each client runs an instance of the Fluid Core, as illustrated in the diagram below.

The Fluid runtime is responsible for managing communication between the client and Fluid server and for applying
incoming operations. The runtime communicates with the Fluid server using Web Sockets, but you do not need to make any
network calls yourself in order to use Fluid. The runtime takes care of that for you.

### Fluid Component Model

On top of the runtime is a layered component model. A Fluid component can have a broad range of capabilities such as
distributed data, rendering, experience integration, and much more. For many developers their primary interaction with
Fluid will be writing components.

<vue-markdown v-if="$themeConfig.DOCS_AUDIENCE === 'internal'">

***

_[source document](https://microsoft.sharepoint.com/:w:/t/Prague/ESoVbMxYtoJKp1CqUUsycjYBuURKe1x3Bwgp4_2yCzrH3A?e=KeWZQd)_
</vue-markdown>
