---
title: Containers and the Runtime
menuPosition: 5
---

A Fluid Container is a foundational concept for creating anything with the Fluid Framework. Most of the sample Fluid Applications use one Fluid Container to manage the user experience, app logic, and app state.

However, a Fluid Container is **not** a standalone application. A Fluid Container is a code plus data package. A Container must be loaded by the Fluid Loader and connected to a Fluid Service.

Because Containers are such a core concept, we'll look at Containers from a few angles.

## What is a Fluid Container?

A Fluid Container is a code plus data package. A Container includes at least one Fluid DataObject for app logic, often multiple Data Objects that are integrated together.

From the Fluid Service perspective, the Container is the atomic unit of Fluid. The service does not know about anything inside of a Fluid Container.

That being said, app logic is handled by Data Objects and state is handled by the Distributed Data Structures within the Data Objects.

So what does the Fluid Container **do**?

## What does the Fluid Container do?

The Fluid Container manages the [service drivers from the loader](./hosts), [process operations to distributed data structures](./dds), and provides a request api for accessing Data Objects.

### Managing the Service Drivers

When the Loader resolves the Fluid Container, it passes the container a group of service drivers. These drivers are the **DeltaConnection**, **DeltaStorageService**, and **DocumentStorageService**. 

The Fluid Container is responsible for 

### Managing the Runtime



### Request API (Using a Fluid Container)

The Fluid Container is mostly interacted with through the request paradigm. While aqueduct creates a default request handler that returns the default Data Object, the request paradigm is a powerful pattern that lets developers create custom logic
