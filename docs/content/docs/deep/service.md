---
title: The Fluid service
menuPosition: 3
aliases:
  - "/docs/concepts/service"
---

The Fluid Framework contains a service component. A reference implementation of a Fluid service called *Routerlicious* is
included in the FluidFramework repo. Note that Routerlicious is one of many Fluid services that could be implemented.
The Fluid Framework uses a loose-coupling architecture for integrating with services, so Fluid is not limited to a single
implementation.


## Responsibilities

Fluid services like Routerlicious have three responsibilities:

1. **Ordering:** They assign monotonically increasing sequence numbers to incoming operations.
1. **Broadcast:** They then broadcast the operations to all connected clients, including their sequence numbers.
1. **Storage:** They're also responsible for storing Fluid data in the form of summary operations.


## Ordering and drivers

The Fluid service ensures that all operations are ordered and also broadcasts the operations to other connected clients.
We sometimes refer to this as "op routing;" this is the source of the name *Routerlicious*.


## Summaries

Summaries are a serialized form of a Fluid document, created by consolidating all operations and serializing the data
model. Summaries are used to improve load performance. When a Fluid document is loaded, the service may send a summary
to the client so that the client does not need to replay all ops locally to get to the current state.

One of the connected clients is chosen to generate the summary. Once the summary is created it is sent to the service
like any other operation. To learn more about summaries and how they are created, see the [advanced Summarizer
topic](./summarizer).


## Drivers

The Fluid Framework uses a loose-coupling architecture for integrating with Fluid services. Drivers are used to abstract
the service-specific behavior. This enables an implementer to use any ordering and storage architecture or technology to
implement the Fluid service.


## More information

You can learn more about Routerlicious, including how to run it using Docker, at
<https://github.com/microsoft/FluidFramework/blob/main/server/routerlicious/README.md>.
