## What is Fluid Framework?

Fluid Framework is a collection of client libraries for building applications with distributed state. These libraries
allow multiple clients to create and operate on shared, synchronized Distributed Data Structures (DDSs) using coding
patterns similar to those used to work with local data. Fluid Framework manages connections to services and keeps all
clients in sync so that developers can focus on the client experience.

Fluid Framework includes a flexible component model. This model facilitates code reuse and makes it simple to embed
Fluid components in various application surfaces while those components all connect to the same DDSs.

## Distributed Data Structures

### What is a DDS?

DDS is short for Distributed Data Structure. DDSs are the foundation of the Fluid Framework. They are designed such
that the Fluid Runtime is able to keep them in sync across clients while each client operates on the DDSs in largely
the same way they would operate on local data. The data source for a Fluid solution can represent numerous DDSs.

### Where is the data stored?

There are two classes of data storage to discuss when answering this question:
**session storage** and **persistent storage**.

**Session storage** is managed by the Fluid service and is, essentially, a central record of all the operations (ops)
performed on the DDSs. This record is used by the Fluid clients to produce identical local instances of the DDSs.
Session storage also includes ops that summarize all past operations to improve performance for clients that join
sessions later and for efficiencies when saving to persistent storage.

**Persistent storage** is a record of ops (and summary ops) saved outside of the Fluid service. This could be a
database, blob storage, or a file. Using persistent storage allows a Fluid solution to persist across sessions.
For example, current Microsoft 365 Fluid experiences save ops in *.fluid* files in SharePoint and OneDrive.
It is important to note that these files share many of the properties of a normal file such as permissions and a
location in a file structure, but because these experiences rely on the Fluid service, downloading the files and
working locally is not supported.

Included in the Fluid ops is a record of all the Fluid components used in the Fluid solution. This doesn't include
the code of the Fluid component but rather a reference that the Fluid client can use to load the correct components.

### How is data sync'd?

In order to keep all clients in sync, they must be connected to a central Fluid service. This service's core
responsibility is sequencing all the incoming Fluid operations and then broadcasting them to all the clients. Because
the ops are ordered, and because each client is running the same code, the DDSs in each client eventually end up in an
identical state.

Note, there isn't only one Fluid service for all Fluid experiences. But for each Fluid experience, there is only one
Fluid service.

Fluid clients connect to the central Fluid service using the WebSocket protocol. However, the Fluid runtime manages
all of the connections so that Fluid component developers can focus on local experiences.

### What are the DDSs currently available in the Fluid Framework

Any plans to add more in the future?

Are there any restrictions about the type of snippets or embeds that can be performed?

How do you decide between multiple structures inside the DDS (vs multiple simpler DDSes)?

How big could be the DDS? For e.g. Tables with 100s of rows and columns

we are able to handle things like images or other data types other than text?

💬 *\[Sam Broner\]*: We have blob support (or did?) but the blobs are not actually in DDS, the manager just says where
blobs should be. It was almost like a map of image (or other data) urls.

💬 *\[Nick Simons\]*: But more importantly, of course we do! And there are multiple approaches like blob support or
directly in the DDS.

💬 *\[Sam Broner\]*: Yep!

## Components and Containers

  
### What is a Component?

A component is a piece of JavaScript. While a component could be almost anything, we are usually talking about Fluid
Components that have two properties: they use IComponent interfaces as an API, and they can (but don't have to)
contain distributed data structures.

One additional detail: all components within a container share the same record of operations, so an operation in one
component can be ordered relative to an operation in another component.

### What is a Container?

A container is a collection of components that make up a standalone experience. Containers are the finest grained
boundary that our service understands, so all of the operations within our container are lumped into record.

Fluid Preview is an example of a Fluid container. Fluid containers always have 1 or more components. To organize our
components, we often have a default component that delegates to other components, but this isn't required.

### What's the difference between a DDS, a Component, and a Container?

A DDS syncs data and is responsible for state. A component can have any number of DDS, but usually includes
additional code to **do something** with the state. A container is a full experience that includes one or more
components and has a 1:1 relationship with the Fluid Service.

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

### What is the difference between Fluid Framework and Adaptive Cards?

Coming soon...

### What is the difference between Fluid Framework and DAPR?

Coming soon...

### Does Fluid use operational transforms?

Fluid does not use Operational Transforms, but we learned a tremendous amount from the literature on OT. While
OT uses operations that can be applied out of order by transforming operations to account for recent changes, Fluid
relies on a Total Order Broadcast to guarantee that all operations are applied in a specific order.

### Does Fluid use CRDT?

Fluid does not use Conflict-Free Replicated Data Types (CRDTs), but our model is more similar to CRDT than OT.
The Fluid Framework relies on update-based operations that are ordered using our Total Order Broadcast to prevent
conflicts. This allows us to have non-commutative operations because their is an explicit ordering.

  
💬 *\[Sam Broner\]*: This seems hard to put in here, but is true:

💬 *\[Sam Broner\]*: While we don't support peer-to-peer scenarios yet, the Fluid Framework is reliant on a total
ordering of all operations. While we haven't invested in this yet, a total ordering could be created through vector
clocks or other distributed ordering techniques.

## Real-Time Collaboration

### What kind of support is there for real-time editing of text?

This is the first scenario

Can we able to create a collaborative editor like RTE and Word editor with this fluid framework?

Coding tables in Word VB is an awful experience. Does Fluid allow for easier scripting of tables in MS Word to
collaborate with others whilst creating documents?

Is it possible to provide concurrent editing experience for office documents using fluid?

## Office Ecosystem

### How does Fluid Framework relate to Office Add-ins?

This answer assumes

How do you see a Web App component used in an Office JS Add-ins eg Excel, working with/enabled/leveraged by Fluid?

### Does the fluid framework require office as a backend?

Is Fluid Framework only applicable to the big 4 (Word, Excel, Powerpoint, Outlook) or does it support apps like OneNote
and Visio?

### Any limitations pertaining O365/M365 GCC tenants?

## Other Scenarios

### Turn-based games?

Would it be possible to allow users to do turn-based actions? For the example, allow them one-by-one to post messages
and one-by-one to vote?

*Is this something like Poker*Game?

### Presence, including mouse cursor?

In previous demo I have seen that even mouse pointers of other people were visible in my screen playing with the
shared HTML elements, is it possible, how does it work?

## Server

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

### Can you put security around DDSs such that you only get updates if you're authorized?

### How do you handle Data Loss/Leakage Prevention?

I think they're worried about a bad actor taking data out of the environment. Can conditional access be applied
for example?

DLP = Data Loss prevention. Preventing data marked as sensitive from leaving environment boundaries.

## Auth

### How is authentication handled?

### How is authorization handled?

## Getting Started

### Where do we start?

Where can I get the framework and start building a component?  

Looks great, can I start writing code/play with samples? If yes, then how, where, when?

Where do we get the Fluid Framework?

How do developers play with Fluid Framework today?

### When can we start?

Is preview of Fluid SDK available right now?

Any approximate idea when the framework will be released? Thanks.

### Where can we access docs for Fluid Framework?

Where could we learn more about DDS objects, especially outside of SharePoint context?

can you please share Microsoft learn or documentations?

Is there currently, or will there be Microsoft docs that talks more about Fluid Framework?

When you say its Open Source, that means I will be able to build components for my web application? How this
would work?

### Access to Sample Code from Demo

Can we get sample code for this solution please?

## Architecture/Specific/Exclude for now

Can you create distinct sessions with this. Using the example this would meain having x dirrefent sets of sticky notes
for different groups of users?

Can this work in a way that allows data to be passed to different applications or does it require the same application?
(Can I use it to pass a sticky note from your React App to Microsoft Teams?

Can I pull data from an on premise server and put it in a dds
