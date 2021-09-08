---
title: "Containers and the container runtime"
menuPosition: 5
aliases:
  - "/docs/concepts/containers-runtime"
draft: true
---

A **Fluid container** is a foundational concept for creating anything with the Fluid Framework. All of the sample Fluid
applications use a Fluid container to manage the user experience, app logic, and app state.

However, a Fluid container is *not* a standalone application. A Fluid container is a *code-plus-data package*. A
container must be loaded by the Fluid loader and connected to a Fluid service.

Because containers are such a core concept, we'll look at them from a few different angles.

## Container vs Runtime

A Fluid container is the instantiated container JavaScript object, but it's also the definition of the container. We
interchangeably use "container" to refer to the class, which can create new objects, and the instantiated object itself.

The `ContainerRuntime` refers to the inner mechanics of the Fluid container. As a developer you will interact with the
runtime through the runtime methods that expose useful properties of the instantiated container object.

## What is a Fluid container?

A Fluid container is a code-plus-data package. A container includes at least one Fluid object for app logic, but
often multiple Fluid objects are composed together to create the overall experience.

From the Fluid service perspective, the container is the atomic unit of Fluid. The service does not know about anything
inside of a Fluid container.

That being said, app logic is handled by Fluid objects and state is handled by the distributed data structures within
the Fluid objects.

## What does the Fluid container do?

The Fluid container interacts with the [processes and distributes operations](./hosts), manages the [lifecycle of Fluid
objects](./dataobject-aqueduct), and provides a request API for accessing Fluid objects.

### Process and distribute operations

When the Fluid loader resolves the Fluid container, it passes the container a group of service drivers. These drivers
are the **DeltaConnection**, **DeltaStorageService**, and **DocumentStorageService**.

The Fluid container includes code to process the operations from the DeltaConnection, catch up on missed operations
using the DeltaStorageService, and create or fetch summaries from the DocumentStorageService. Each of these are
important, but the most critical is the op processing.

The Fluid container is responsible for passing operations to the relevant distributed data structures and Fluid objects.

### Manage Fluid object lifecycle

The container provides a `createDataStore` method to create new data stores. The container is responsible for
instantiating the Fluid objects and creating the operations that let other connected clients know about the new Fluid
object.

### Using a Fluid container: the Request API

The Fluid container is interacted with through the request paradigm. While aqueduct creates a default request handler
that returns the default Fluid objects, the request paradigm is a powerful pattern that lets developers create custom
logic.

To retrieve the default data store, you can perform a request on the container. Similar to the [loaders API](./hosts.md)
this will return a status code and the default data store.

```ts
container.request({url: "/"})
```
