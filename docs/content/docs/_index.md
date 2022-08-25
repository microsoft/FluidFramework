---
title: Fluid Framework Documentation
meta: "meta"
cascade:
  includeApiSubmenu: true
---

## What is Fluid Framework?

Fluid Framework is a collection of client libraries for distributing and synchronizing shared state. These libraries
allow multiple clients to simultaneously create and operate on shared data structures using coding
patterns similar to those used to work with local data.

## Why Fluid?

Because building low-latency, collaborative experiences is hard!

Fluid Framework offers:

* Client-centric application model with data persistence requiring no custom server code.
* Distributed data structures with familiar programming patterns.
* Very low latency.

The developers at Microsoft have built collaboration into many applications, but many required application specific
server-side logic to manage the collaborative experience. The Fluid Framework is the result of Microsoft's investment
in reducing the complexity of creating collaborative applications.

What if you didn't have to invest in server code at all? Imagine if you could use a general purpose server
which was designed to be lightweight and low cost. Imagine if all your development was focused on the client
experience and data sync was handled for you. That is the promise of Fluid.

## Focused on the client developer

Applications built with Fluid Framework require zero custom code on the server to enable sophisticated data sync
scenarios such as real-time typing across text editors. Client developers can focus on customer experiences while
letting Fluid do the work of keeping data in sync.

Fluid Framework works with your application framework of choice.
Whether you prefer plain JavaScript or a framework like [React](https://reactjs.org), [Angular](https://angular.io),
or [Vue](https://vuejs.org), Fluid Framework makes building collaborative experiences simple and flexible.

## How Fluid works

Fluid was designed to deliver collaborative experiences with blazing performance. To achieve this goal, the team kept
the server logic as simple and lightweight as possible. This approach helped ensure virtually instant syncing across
clients with very low server costs.

To keep the server simple, each Fluid client is responsible for its own state. While previous systems keep a source of
truth on the server, the Fluid service is responsible for taking in data operations, sequencing the operations, and
returning the sequenced operations to the clients. Each client is able to use that sequence to independently and
accurately produce the current state regardless of the order it receives operations.

The following is a typical flow.

1. Client code changes data locally.
2. Fluid runtime sends that change to the Fluid service.
3. Fluid service sequences that operation and broadcasts it to all clients.
4. Fluid runtime incorporates that operation into local data and raises a "valueChanged" event.
5. Client code handles that event (updates view, runs business logic).

## Getting to version 1.0

The core technology powering Fluid Framework is mature and stable. However, the layers built on top of that
foundation are still a work in progress. Over the coming months we will be evolving APIs, adding new features,
and working to further simplify using the framework. These changes are driven by Microsoft's use of
Fluid internally as well as by requirements we are gathering from developers currently building on Fluid.

Fluid Framework is not ready to power production-quality solutions yet. But we are excited to open source it now
to give developers an opportunity to explore, learn, and contribute both through feedback and through direct
participation.

## Next steps

If you want to learn a lot more about how Fluid works, start with our
**[architecture]({{< relref "architecture.md" >}})** overview.

If you prefer to get your hands dirty right away, head for our coding **[tutorial]({{< relref "tutorial.md" >}})** and
**[examples]({{< relref "examples.md" >}})**. But first, get your **[dev environment]({{< relref "quick-start.md" >}})**
set up.

Still have questions? Maybe we've answered them in our **[FAQ]({{< relref "faq.md" >}})**. If not, check out our
**[Community page]({{< relref "/community/" >}})**.
