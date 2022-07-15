---
title: Architecture
menuPosition: 1
aliases:
  - "/docs/deep/architecture"
---

The Fluid Framework can be broken into three broad parts: The *Fluid loader*, *Fluid containers*, and the *Fluid
service*. While each of these is covered in more detail elsewhere, we'll use this space to explain the areas at a high
level, identify the important lower level concepts, and discuss some of our key design decisions.

## Introduction

The Fluid loader connects to the Fluid service and loads a Fluid container.

```goat
+-----Client (or Host)------------------------------------------------------+
|                                                                           |
| +----------------------------------------------------------------------+  |
| |        Fluid Loader                                                  |  |
| | +------------------------+ +-------------------+  +----------------+ |  |
| | | Document Service       | | Code Loader       |  |  Scopes        | |  |
| | | Factory                | |                   |  +----------------+ |  |
| | |                        | |                   |                     |  |
| | |                        | |                   |  +----------------+ |  |
| | |                        | |                   |  | URL Resolver   | |  |
| | |                        | |                   |  |                | |  |
| | +------------------------+ +-------------------+  +----------------+ |  |
| |                                                                      |  |
| +----------------------------------------------------------------------+  |
|                                                                           +------------+
| +---------Fluid Runtime (Container)------------------------------------+  |            |
| |                                                                      |  |            v
| | +--------------------------+  +----------------+  +----------------+ |  |  +---------------------+
| | |                          |  |                |  |                | |  |  |                     |
| | |                          |  |                |  |                | |  |  |    Fluid Service    |
| | |      Data Store          |  |   Data Store   |  |   Data Store   | |  |  |                     |
| | |                          |  |                |  |                | |  |  +---------------------+
| | |                          |  |                |  |                | |  |
| | |                          |  |                |  |                | |  |
| | |                          |  |                |  |                | |  |
| | |  +-----+   +-----+       |  |    +-----+     |  |   +-----+      | |  |
| | |  |     |   |     |       |  |    |     |     |  |   |     |      | |  |
| | |  | DDS |   | DDS |       |  |    | DDS |     |  |   | DDS |      | |  |
| | |  |     |   |     |       |  |    |     |     |  |   |     |      | |  |
| | |  +-----+   +-----+       |  |    +-----+     |  |   +-----+      | |  |
| | +--------------------------+  +----------------+  +----------------+ |  |
| +----------------------------------------------------------------------+  |
|                                                                           |
+---------------------------------------------------------------------------+
```

The Fluid architecture consists of a client and service. The
client contains the Fluid loader and the Fluid container. The Fluid loader contains a document service factory, code
loader, scopes, and a URL resolver. The Fluid runtime is encapsulated within a container, which is built using Shared
objects and distributed data structures.

If you want to load a Fluid container on your app or website, you'll load the container with the Fluid loader. If you
want to create a new collaborative experience using the Fluid Framework, you'll create a Fluid container.

A Fluid container includes state and app logic. It's a serverless app model with data persistence. It has at least one
*shared object*, which encapsulates app logic. Shared objects can have state, which is managed by *distributed data
structures* (DDSes).

DDSes are used to distribute state to clients. Instead of centralizing merge logic in the
server, the server passes changes (aka operations or ops) to clients and the clients perform the merge.

## Design decisions

### Keep the server simple

In existing production-quality collaborative algorithms, like Operational Transformations (OT), significant latency is
introduced during server-side processing of merge logic.

We dramatically reduce latency by moving merge logic to the client. The more logic we push to the client, the fewer
milliseconds the request spends in the datacenter.

### Move logic to the client

Because merge logic is performed on the client, other app logic that's connected to the distributed data should also be
performed on the client.

All clients must load the same merge logic and app logic so that clients can compute an eventually consistent state.

### Mimic (and embrace) the web

The Fluid Framework creates a distributed app model by distributing state and logic to the client. Because the web is
already a system for accessing app logic and app state, we mimicked existing web protocols when possible in our model.

## System overview

Most developers will use the Fluid Framework to create Fluid containers.

Based on our two design principles of "Keep the server simple" and "Move logic to the client", the majority of the Fluid
codebase is focused on building containers.

### Fluid container

The Fluid container defines the application logic while containing persistent data. If the Fluid Framework is a
serverless application model with persistent data, the container is the serverless application and data.

The Fluid container is the result of the principle "Move Logic to the Client." The container includes the merge logic
used to replicate state across connected clients, but the container also includes app logic. The merge logic is
encapsulated in our lowest level objects, **distributed data structures (DDS)**. App logic operating over this data is
stored in **shared objects**.

### Fluid service

The Fluid service is primarily a total-order broadcast: it takes in changes (called "operations" or "ops") from each
client, gives each op a sequential order number, and sends each ordered op back to each client. Distributed data
structures use these ops to reconstruct state on each client. The Fluid service doesn't parse any of these ops; in fact,
the service knows nothing about the contents of any Fluid container.

```goat
                                                        URL
                                                         +
                                                         |
                                                         |
                                                         v
+--------------------------------------------------------+-------------------------------------------+
| Fluid Loader                                                                                       |
|                                                                                                    |
| +-------------------------+ +-------------------------+ +-------------------------+ +------------+ |
| |    Container Lookup &   | |  Fluid Service Driver   | | Container Code Loader   | | options    | |
| |        Resolver         | |                         | |                         | |            | |
| |                         | |                         | |                         | +------------+ |
| |                         | |                         | |                         |                |
| |                         | |                         | |                         | +------------+ |
| |                         | |                         | |                         | | scopes     | |
| |                         | |                         | |                         | |            | |
| +-------------------------+ +-------------------------+ +-------------------------+ +------------+ |
|                                                                                                    |
+--------------------------------------------------------+-------------------------------------------+
                                                         |
                                                         | request
                                                         |
                                                         v
                                             +-----------+-------------+
                                             |    Fluid Container or   |
                                             |       Shared Object     |
                                             |                         |
                                             +-------------------------+
```

Clients send operations to the Fluid service, which are assigned an order and then broadcast to the other connected
clients. The client sending the operation also receives an acknowledgement from the service with the assigned order of
the operation.

From the client perspective, this op flow is accessed through a **DeltaConnection** object.

The service also stores old operations, accessible to clients through a **DeltaStorageService** object, and stores
summaries of the shared objects. It's worth discussing summaries at length, but for now, consider that merging
1,000,000 changes could take some time, so we summarize the state of the objects and store it on the service for faster
loading.
