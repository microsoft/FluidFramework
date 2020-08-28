---
title: Containers and the Runtime
menuPosition: 5
---

A Fluid Container is a foundational concept for creating anything with the Fluid Framework. All of the sample Fluid Applications use a Fluid Container to manage the user experience, app logic, and app state.

However, a Fluid Container is **not** a standalone application. A Fluid Container is a code plus data package. A Container must be loaded by the Fluid Loader and connected to a Fluid Service.

Because Containers are such a core concept, we'll look at Containers from a few angles.

## Container vs Runtime

A Fluid Container is the instantiated Container javascript object, but it's also the definition of the Container. We interchangeably use Container to refer to the class, which can print new objects, and the object itself.

The Container Runtime refers to the inner mechanics of the Fluid Container. As a developer you will interact with the runtime through the runtime methods that expose useful properties of the instantiated Container object.

## What is a Fluid Container?

A Fluid Container is a code plus data package. A Container includes at least one Fluid DataObject for app logic, but often multiple Data Objects that compose together to create the user experience.

From the Fluid Service perspective, the Container is the atomic unit of Fluid. The service does not know about anything inside of a Fluid Container.

That being said, app logic is handled by Data Objects and state is handled by the Distributed Data Structures within the Data Objects.

So what does the Fluid Container **do**?

## What does the Fluid Container do?

The Fluid Container interacts with the [processes and distributes operations](./hosts), manages the [lifecycle of Data Objects](./dataobject-aqueduct), and provides a request api for accessing Data Objects.

### Process and Distribute Operations

When the Loader resolves the Fluid Container, it passes the container a group of service drivers. These drivers are the **DeltaConnection**, **DeltaStorageService**, and **DocumentStorageService**.

The Fluid Container includes code to process the ops from the DeltaConnection, catch up on missed operations using the DeltaStorageService, and create or fetch summaries from the DocumentStorageService. Each of these are important, but the most critical is the op processing.

The Fluid Container is responsible for passing operations to the relevant distributed data structures and Fluid Objects.

### Manage Data Object Lifecycle

The Container provides a `createDataStore` method to create new Data Objects. The Container is responsible for instantiating the Data Object and creating the operations that let other connected clients know about the new Data Object.

### Request API (Using a Fluid Container)

The Fluid Container is interacted with through the request paradigm. While aqueduct creates a default request handler that returns the default Data Object, the request paradigm is a powerful pattern that lets developers create custom logic.

To retrieve the default data store, you can perform a request on the container. Similar to the [loaders api](./hosts.md) this will return a status code and the default data store.

```
container.request({url: "/"})
```
