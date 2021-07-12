---
title: Overview
menuPosition: 1
author: skylerjokiel
editor: tylerbutler
---

## Architecture overview

There are three primary concepts to understand when building an application with Fluid.

- Service
- Container
- Shared objects

### Service

Fluid clients require a centralized service that all connected clients use to send and receive operations. When using Fluid in an application you must use the correct package that corresponds to the underlying service you are connecting to. Fluid offers multiple service implementations developers can use out of the box. See [Available Fluid Services]({{< relref "service-options.md" >}}) for more information about Fluid service options.

Each service specific package adhere to a common API structure and has the primary goal of creating and retrieving container objects.

The [Tinylicious service]({{< relref "Tinylicious" >}}) is a local testing service and is used in Fluid examples throughout this documentation. Other services include the [Azure Fluid Relay]({{< relref "azure-frs.md" >}}) service which enables high-scale production scenarios.

See [Supported service-specific client packages](#Supported-service-specific-client-packages) for more details.

### Container

The container is the primary unit of encapsulation in Fluid. It consists of a collection of shared objects and supporting APIs to manage the lifecycle of the container and the objects within it.

New containers require a client-driven action and container lifetimes are bound to the data stored on the supporting server. When getting existing containers it's important to consider the previous state of the container.

For more about containers see [Containers](./containers.md).

### Shared objects

A shared object is an object type that powers collaborative data by exposing a specific API. Many shared objects can exist within the context of a container and they can be created either statically or dynamically. Distributed Data Structures(DDSes) and DataObjects are both types of shared objects.

For more information see [Data modeling](./data-modeling.md).

## Package structure

There are two primary packages you'll use when building with Fluid. The `fluid-framework` package
and a service-specific client package like `tinylicious-client`.

### Service-specific client packages

Fluid works with multiple service implementations. Each service has a corresponding service-specific client package. These packages contain a common API structure but also support functionality unique to each service.

The Tinylicious service is a local Fluid service. This documentation uses `@fluid-experimental/tinylicious-client` (or simply `client`). For specifics about each service-specific client implementation see their corresponding documentation.

#### Supported service-specific client packages

- `@fluid-experimental/tinylicious-client` -- the client for the [Tinylicious]({{< relref "Tinylicious" >}}) service.
- `@fluid-experimental/frs-client` -- the client for the [Azure Fluid Relay]({{< relref "azure-frs.md" >}}) service.

### The `fluid-framework` package

The `fluid-framework` package is a collection of core Fluid APIs that make it easy to build and use applications. This package contains all the common type definitions as well as all the primitive shared objects.
