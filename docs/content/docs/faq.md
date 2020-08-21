---
title: Frequently Asked Questions
---

## What is Fluid Framework?

Fluid Framework is a collection of client libraries for building applications with distributed state. These libraries
allow multiple clients to create and operate on shared, synchronized Distributed Data Structures (DDSes) using coding
patterns similar to those used to work with local data. Fluid Framework manages connections to services and keeps all
clients in sync so that developers can focus on the client experience.

Fluid Framework was designed with performance and ease of development as top priorities.

## Distributed Data Structures

### What is a DDS?

DDS is short for Distributed Data Structure. DDSes are the foundation of the Fluid Framework. They are designed such
that the Fluid Runtime is able to keep them in sync across clients while each client operates on the DDSes in largely
the same way they would operate on local data. The data source for a Fluid solution can represent numerous DDSes.

There are many types of DDSes including a SharedMap that is a distributed version of a JavaScript Map and a SharedString
that is designed to enable real-time editing of text data by multiple clients simultaneously. Developers can use the
DDSes included with Fluid Framework or develop new ones.

Any practical limits on the types of data and size of a DDS will be specific to the implementation of that DDS. DDSes
can contain text, images, and other binary data and can effectively be any size. However, managing scale on the client
requires thought, just as it does when working with local data.

### Where is the data stored?

There are two classes of data storage to discuss when answering this question:
**session storage** and **persistent storage**.

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

### How is data sync'd?

In order to keep all clients in sync, they must be connected to a Fluid service. This service's core
responsibility is sequencing all the incoming Fluid operations and then broadcasting them to all clients. Because
the ops are ordered, and because each client is running the same code, the DDSes in each client eventually end up in an
identical state.

Note, there isn't a centralized Fluid service for all Fluid experiences. But for each Fluid experience, there is only one
Fluid service.

Fluid clients connect to the Fluid service using the WebSocket protocol. However, the Fluid runtime manages
all of the connections so that Fluid client developers can focus on local experiences.

## Scale

### How many concurrent users does this support?

It depends. Because the Fluid service is extremely lightweight, even a simple implementation of the service can
support 100s of concurrent users. A more sophisticated implementation can distribute the work and support 1000s. The
experience on the client will vary depending on the Fluid component and local device. When considering scale for
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

Where SignalR is a technology principally aimed at simplifying real-time communication between servers and clients
Fluid Framework further abstracts that communication and, more significantly, focuses on distributing state between
multiple clients. So, while you might use Fluid to solve some of the same problems you solve with SignalR today,
the two are not interchangeable. Notably, the server component of a Fluid solution is lightweight and general-purpose
while a SignalR solution designed to distribute state would require additional server development.

### Does Fluid use operational transforms?

Fluid does not use Operational Transforms, but we learned a tremendous amount from the literature on OT. While
OT uses operations that can be applied out of order by transforming operations to account for recent changes, Fluid
relies on a Total Order Broadcast to guarantee that all operations are applied in a specific order.

### Does Fluid use CRDT?

Fluid does not use Conflict-Free Replicated Data Types (CRDTs), but our model is more similar to CRDT than OT.
The Fluid Framework relies on update-based operations that are ordered using our Total Order Broadcast to prevent
conflicts. This allows us to have non-commutative operations because their is an explicit ordering.

## Use Cases

### What kind of support is there for real-time editing of text?

This is the scenario that Fluid was first designed to support. Consequently, Fluid Framework is an ideal foundation
for rich text editors that support simultaneous editing by multiple clients. The SharedString DDS is
taylor made for this scenario.

### Turn-based games?

DDSes can be used to distribute state for games, including who's turn it is. It's up to the client to enforce the rules
of a game so there may be some interesting problems to solve around preventing cheating but the Fluid team has already
prototyped several games.

### Presence, including mouse cursor?

Keeping track of and sharing each user's position in a grid, a document, or some other virtual space is an ideal
task for Fluid Framework because it is designed to enable extraordinary performance.

## Fluid Server

### What needs to be running on the server?

Where is the shared data stored and can I create my own backend store?

Must a given document be handled by a single server (affinity)?

### Is there a dedicated cloud service for syncing the clients?

is there any service cost for developers?

You said that in this demo the fluid framework server (backend for DDS management) runs on your local computer, can
it run on an azure service as well?

### Besides SharePoint, where else can we store .fluid files?

### Can we use fluid framework standalone with no dependencies on other services?

### Can it be used in a situation without access to the internet?

Think "truck full of servers & clients" or "cargo ship".

Can it run on-perm? Without connecting to internet - for data security.

### Is the fluid reference server implementation production ready?

### How are Fluid Components/Solutions deployed?

The main.tsx file where is it deployed? To the Fluid Server? The Fluid component structure are the definitions
fetched from the Fluid server or are they stored in the Fluid document?

## Conflicts and History

### How does Fluid Framework deal with conflict resolution?

### Can we create custom strategies to handle update collisions to the distributed data structure?

What sort of event update of the DDS do you get, just a change notice, or something more complex like a delta?

### Can we have history of the changes?

As people type, they may change their minds. Some may see one bit of information today but now the text is different.
Is history of changes kept like one might see in Word versioning?

Would we have direct access to the underlying operations?

### Is there any way to know which user caused each change?

## UX Frameworks

### Can I use...?

- React

- Angular

- VUE

- Svelte

- some other UX framework?

### What is the relationship with...?

- Can you speak to the relationship between Fluid components and Fluent UI?

### Is Fluid trying to be a competitor to UX frameworks?

## Coding Frameworks

### Can I use...?

- ASP.NET, ASP.NET Core, and C#

- Blazor WASM

- Xamarin, MAUI, and other mobile frameworks

- TypeScript

- Other programming languages

### What is the relationship with...?

- PowerPlatform

## Browsers

### What browsers are supported?

## Intelligent Agents, Security, and Compliance

### Can you talk about role of Intelligent Agents? Any examples?

We have PCI requirements to not allow a credit card number in a note. We would need to pre-filter the content before
it is shared with others. Is that possible.

How can we apply governance and policies to Fluid Framework implementations? For example, to keep track on abusive
language or dangerous content like credit card numbers...

What about server-side code, like a bot, interacting with users?

### Can you put security around DDSes such that you only get updates if you're authorized?

### How do you handle Data Loss/Leakage Prevention?

I think they're worried about a bad actor taking data out of the environment. Can conditional access be applied
for example?

DLP = Data Loss prevention. Preventing data marked as sensitive from leaving environment boundaries.

## Auth

### How is authentication handled?

### How is authorization handled?
