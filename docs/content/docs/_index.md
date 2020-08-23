---
title: Fluid Framework
meta: "What is Fluid Framework"
---

Fluid Framework is a collection of client libraries for building applications with distributed state. These libraries
allow multiple clients to create and operate on shared, synchronized data structures using coding
patterns similar to those used to work with local data.

## Focused on the client developer

Applications built with Fluid Framework require zero custom code on the server to enable sophisticated data sync
scenarios such as real-time typing across text editors. Client developers can focus on customer experiences while
letting Fluid do the work of keeping data in sync.

Fluid Framework works with your application framework of choice. Whether you prefer straight JavaScript or
a framework like React, Angular, or Vue; Fluid Framework makes building collaborative experiences simple and
flexible.

## How Fluid works

From the start, Fluid was designed to deliver collaborative experiences with blazing performance. To achieve this goal,
the team kept the server logic as simple and light-weight as possible. This approach helped ensure virtually instant
syncing across clients. It also came with the added benefit of very low server costs.

To keep the server simple, each Fluid client is responsible for its own state. In order to ensure
that all clients arrive at the same state, the server sequences data operations and Fluid ensures that clients
are running the same code. Each client is able to use that sequence to independently and accurately produce the current
state regardless of the order it receives operations.

Here is a typical flow...

- Client code changes data locally
- Fluid runtime sends that change to the Fluid server
- Fluid server orders that operation and broadcasts it to all clients
- Fluid runtime incorporates that operation into local data and raises a "valueChanged" event
- Client code handles that event (updates view, runs business logic)

## Next Steps

If you want to learn a lot more about how Fluid works, start with our
[architecture](concepts/architecture.md) overview.

If you prefer to get you hands dirty right away, head for our coding [tutorial](get-started/tutorial.md) and [examples](get-started/examples.md).
But first, get your [dev environment](get-started/dev-env.md) set up.

Still have questions? Maybe we've answered them in our [FAQ](faq.md). If not, check out our [Community page](/community/).
