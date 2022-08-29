---
title: Overview
menuPosition: 1
author: skylerjokiel
editor: tylerbutler
---

{{< callout note >}}

This article assumes that you are familiar with the concept of *operation* in the Fluid Framework. See [How Fluid works]({{< relref "docs/_index.md#how-fluid-works" >}}).

{{< /callout >}}

There are three primary concepts to understand when building an application with Fluid.

- Service
- Container
- Shared objects

### Service

Fluid clients require a centralized service that all connected clients use to send and receive operations. Fluid offers multiple service implementations that developers can use without any modifications. For each of them, there is a corresponding client library. You must use the client library that corresponds to the service you are connecting to. See [Available Fluid Services]({{< relref "service-options.md" >}}) for more information about Fluid service options.

Each service-specific library adheres to a common API structure and has the primary goal of creating and retrieving container objects. The common structure enables you to switch from one service to another with minimal code changes. There are two services currently available:

- The [Tinylicious service]({{< relref "Tinylicious" >}}) runs on your development computer and is used for development and testing. It is used in Fluid examples throughout this documentation.
- [Azure Fluid Relay]({{< relref "azure-frs.md" >}}) runs in Azure and enables high-scale production scenarios.

See [Service-specific client libraries](#service-specific-client-libraries) for more details.

### Container

The container is the primary unit of encapsulation in Fluid. It consists of a collection of shared objects and supporting APIs to manage the lifecycle of the container and the objects within it. New containers must be created from a client, but are bound to the data stored on the supporting server. After a container has been created, it can be accessed by other clients.

For more about containers see [Containers](./containers.md).

### Shared objects

A *shared object* is any object type that supports collaboration (simultaneous editing). Fluid Framework contains two
types of shared objects:

- **Distributed data structures (DDSes):** A DDS holds shared data that the collaborators are working with.
- **Data Objects:** A Data Object contains one or more DDSes that are organized to enable a particular collaborative use case.

DDSes are low-level data structures, while Data Objects are composed of DDSes and other shared objects. Data Objects are
used to organize DDSes into semantically meaningful groupings for your scenario, as well as providing an API surface to your app's data.

For more information about these types and the differences between them, see [Data modeling]({{< relref "data-modeling.md" >}}) and [Introducing distributed data structures]({{< relref "dds.md" >}}).

## Library structure

There are two primary libraries you'll use when building with Fluid: the basic Fluid Framework library and a service-specific client library (such as Fluid Azure Relay or Tinylicious).

### The Fluid Framework library

The Fluid Framework library is a collection of core Fluid APIs that make it easy to build and use applications.
This library contains all the common type definitions as well as all the built-in shared objects.
The library is in the package [fluid-framework](https://www.npmjs.com/package/fluid-framework).

### Service-specific client libraries

Fluid works with multiple service implementations. Each service has a corresponding service-specific client library. These libraries have a common API structure but also support functionality unique to each service.

For specifics about each service-specific client implementation see their corresponding documentation.

- The client library for the [Tinylicious]({{< relref "Tinylicious" >}}) service is in the package [@fluidframework/tinylicious-client](https://www.npmjs.com/package/@fluidframework/tinylicious-client).
- The client library for the [Azure Fluid Relay]({{< relref "azure-frs.md" >}}) is in the package [@fluidframework/azure-client](https://www.npmjs.com/package/@fluidframework/azure-client).

For more information see [Packages]({{< relref "packages.md" >}}).
