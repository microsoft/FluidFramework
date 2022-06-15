---
title: Frequently Asked Questions
aliases:
  - "/start/faq/"
---

The following are short, sometimes superficial, answers to some of the most commonly asked questions about the Fluid
Framework.

## What is the Fluid Framework?

The Fluid Framework is a collection of client libraries for building applications with distributed state. These libraries
allow multiple clients to create and operate on shared, synchronized distributed data structures (DDSes) using coding
patterns similar to those used to work with local data. The Fluid Framework manages connections to services and keeps all
clients in sync so that developers can focus on the client experience.

The Fluid Framework was designed with performance and ease of development as top priorities.

## Distributed Data Structures

### What is a DDS?

DDS is short for *distributed data structure*. DDSes are the foundation of the Fluid Framework. They are designed such
that the Fluid runtime is able to keep them in sync across clients while each client operates on the DDSes in largely
the same way they would operate on local data. The data source for a Fluid solution can represent numerous DDSes.

There are many types of DDSes including a [SharedMap]({{< relref "map.md" >}}) that is a distributed version of a JavaScript Map, and a [SharedString]({{< relref "string.md" >}}) that is designed to enable real-time editing of text data by multiple clients simultaneously.
Developers can use the DDSes included with the Fluid Framework or develop new ones.

Any practical limits on the types of data and size of a DDS will be specific to the implementation of that DDS. DDSes
can contain text, images, and other binary data and can effectively be any size. However, managing scale on the client
requires thought, just as it does when working with local data.

### Where is the data stored?

There are two classes of data storage to discuss when answering this question: **session storage** and
**persistent storage**.

**Session storage** is managed by the Fluid service and is, essentially, a central record of all the operations (ops)
performed on the DDSes. This record is used by the Fluid clients to produce identical local instances of the DDSes.
Session storage also includes ops that summarize all past operations to improve performance for clients that join
sessions later and for efficiencies when saving to persistent storage.

**Persistent storage** is a record of ops (and summary ops) saved outside of the Fluid service. This could be a
database, blob storage, or a file. Using persistent storage allows a Fluid solution to persist across sessions.
For example, current Microsoft 365 Fluid experiences save ops in *.fluid* files in SharePoint and OneDrive.
It is important to note that these files share many of the properties of a normal file such as permissions and a
location in a file structure, but because these experiences rely on the Fluid service, downloading the files and
working locally is not supported.

### How is data synchronized?

In order to keep all clients in sync, they must be connected to a Fluid service. This service's core
responsibility is sequencing all the incoming Fluid operations and then broadcasting them to all clients. Because
the ops are ordered, and because each client is running the same code, the DDSes in each client eventually end up in an
identical state.

Note, there isn't a centralized Fluid service for all Fluid experiences. But for each Fluid experience, there is only
one Fluid service.

Fluid clients connect to the Fluid service using the [WebSocket](https://en.wikipedia.org/wiki/WebSocket) protocol.
However, the Fluid runtime manages all of the connections so that Fluid client developers can focus on local experiences.

## Scale

### How many concurrent users does this support?

It depends. Because the Fluid service is extremely lightweight, even a simple implementation of the service can
support 100s of concurrent users. A more sophisticated implementation can distribute the work and support 1000s. The
experience on the client will vary depending on the Fluid data store and local device. When considering scale for
Fluid solutions, consider how well the client can handle and render changes, not whether the service is able to
distribute them efficiently.

Also, there is a significant difference in capacity depending on whether users are purely viewers vs. editors.
Adding viewers scales far more than adding editors because each editor increases the volume of changes and viewers
do not.

### How do you design Fluid Framework solutions to scale?

When thinking about scale there are two key factors: service scale and client scale. The Fluid service is designed
from the ground up to be extremely scalable. While there is the potential to refine the service to the point where
it is staggeringly scalable, for most Fluid developers the larger concern will be client scale.

When tackling client scale, developers need to consider how they will manage inbound changes, especially when the
volume of changes is high. The specific strategies developers should consider start when considering which DDS types
to use and how the data is structured. From there developers can look at using virtualization to limit updates to
parts of the view that are currently in scope. Another strategy could be to throttle inbound changes to limit the
number of updates that are required. Of course, the right strategies will depend enormously on the specific scenario.

## Fluid Technology

### What's the difference between Fluid Framework and SignalR?

Where SignalR is a technology principally aimed at simplifying real-time communication between servers and clients,
the Fluid Framework further abstracts that communication and, more significantly, focuses on distributing state between
multiple clients. So, while you might use Fluid to solve some of the same problems you solve with SignalR today,
the two are not interchangeable. Notably, the server component of a Fluid solution is lightweight and general-purpose
while a SignalR solution designed to distribute state would require additional server development.

### Does Fluid use operational transforms?

Fluid does not use Operational Transforms (OTs), but we learned a tremendous amount from the literature on OT.
While OT uses operations that can be applied out of order by transforming operations to account for recent changes, Fluid relies on a [Total Order Broadcast]({{< relref "tob.md" >}}) to guarantee that all operations are applied in a specific order.

### Does Fluid use CRDT?

Fluid does not use Conflict-Free Replicated Data Types (CRDTs), but our model is more similar to CRDT than OT.
The Fluid Framework relies on update-based operations that are ordered using our Total Order Broadcast to prevent
conflicts. This allows us to have non-commutative operations because there is an explicit ordering.

## Use Cases

### What kind of support is there for real-time editing of text?

This is the scenario that Fluid was first designed to support.
Consequently, the Fluid Framework is an ideal foundation for rich text editors that support simultaneous editing by multiple clients.
The [SharedString]({{< relref "string.md" >}}) DDS is tailor-made for this scenario.

### Turn-based games?

DDSes can be used to distribute state for games, including whose turn it is. It's up to the client to enforce the rules
of a game so there may be some interesting problems to solve around preventing cheating but the Fluid team has already
prototyped several games.

### Presence, including mouse cursor?

Keeping track of and sharing each user's position in a grid, a document, or some other virtual space is an ideal
task for the Fluid Framework because it is designed to enable extraordinary performance.

## Fluid Service

### What needs to be running on the server?

The Fluid Framework requires a Fluid service to sync data between clients. The role of the server is very simple:
it orders operations and broadcasts them to all clients. It's also responsible for saving operations to
persistent data storage.

The Fluid service is general-purpose and, as a rule, Fluid solutions will work with any Fluid service. Developers of
Fluid solutions can use a local server or a "test quality" server for development and trust that their solution
will work against whatever production server their solution is pointed at.

The Fluid Framework includes a reference implementation of the Fluid service called [Routerlicious](https://github.com/microsoft/FluidFramework/tree/main/server#readme) that you can use for
development or as the basis for a production quality server.

### Where is the shared data stored?

The specifics of data storage (both session data and persistent data) will depend on the implementation of
the Fluid service. There is a great deal of flexibility here and developers of Fluid services may choose to offer
options around where and how data is stored.

### Is there a dedicated cloud service for syncing the clients?

Microsoft has developed an M365-specific Fluid service designed to enable solutions powered by Fluid within that
ecosystem. There will be ways for Fluid Framework developers to operate in M365 but those integration points are
not available yet.

Microsoft has also announced [Azure Fluid Relay](https://azure.microsoft.com/en-us/services/fluid-relay/#overview), a fully managed Fluid service.

### Besides SharePoint, where else can we store .fluid files?

.fluid files are a specific file format understood by Fluid solutions integrated with M365. They are designed to operate
exclusively in the cloud (never locally) and currently are only supported by OneDrive and SharePoint.

### Can we use Fluid Framework standalone with no dependencies on other services?

Yes. The Fluid Framework is designed to stand alone. It has no dependencies on other services.

### Can the Fluid Framework be used in a situation without access to the internet?

There are two angles to this question. One is whether the client must be connected to the internet. The other is
whether an organization could run the Fluid service on-site to support an intranet.

Clients do have to be connected to the Fluid service. Fluid can tolerate brief network outages and continue operating
but eventually the promise of being able to merge local changes weakens. We are investigating ways to improve this using
other merging techniques designed to reason over large deltas but no final solution is in place today.

In principle there is nothing preventing an organization from hosting a Fluid service on an intranet. However, Microsoft
has no plans to support that scenario directly.

### Is the Fluid reference server implementation production-ready?

No. Routerlicious on its own is not production-ready. Using it would require more thought about storage, scale,
security, and other typical considerations when building out a service on the internet. It is our expectation that most
Fluid developers will be able to leverage existing Fluid services that will emerge as we approach version 1.0.

### How are Fluid solutions deployed?

Fluid solutions are, at the end of the day, simple JavaScript.
At Microsoft, Fluid solutions are deployed to [content delivery network](https://en.wikipedia.org/wiki/Content_delivery_network)s (CDNs) like any other static resource.
Because Fluid is very client-centric, deployment is very simple.

## Conflicts and History

### How does Fluid Framework deal with conflict resolution?

This depends a great deal on the specific DDS. But, regardless of the final state of the data, operations are stored
in the Fluid ops stream. So, in cases where a client is unhappy with the final state, there are approaches for
achieving consensus that can be built into the DDS or handled by the client.

### Can we create custom strategies to handle update collisions to the distributed data structure?

Yes. You can design your own DDSes with your own strategies for handling merge. You also have access to all
operations and can write client code to reason over state in whatever way best suits your scenario.

### Can we have history of the changes?

Yes. Fluid inherently keeps all changes and these are accessible through the framework. The only caveat is that for
performance and storage efficiency, operations need to be summarized from time to time. This may cause a loss of
granularity.

### Is there any way to know which user caused each change?

Yes. Operations can be attributed to users. This is an implementation choice and not something built directly into
the Fluid Framework.

## UX Frameworks

### Can I use React, Angular, VUE, Svelte, or some other UX framework?

Yes. You can use any UX framework designed for the web.

### What is the relationship with Fluent UI?

Both Fluent and Fluid Framework come from Microsoft. And inside Microsoft many Fluid projects also use Fluent.
But there is no relationship other than the names are similar.

### Is Fluid trying to be a competitor to UX frameworks?

Not at all. The Fluid Framework is unopinionated about UX.

## Coding Frameworks

### Can I use ASP.NET, ASP.NET Core, and C\#?

The Fluid Framework is written in TypeScript but we don't want it to be limited to the web. You can use the Fluid Framework
with non-web technologies by leveraging a JavaScript runtime to host the Fluid code. Ultimately it is critical that the same
code be running in all clients to ensure eventual consistency of data so it is impractical to port Fluid to other coding
frameworks.

This also applies to Blazor, Xamarin, MAUI, and other mobile frameworks.

## Browsers

### What browsers are supported?

{{% include file="_includes/browsers.md" %}}
