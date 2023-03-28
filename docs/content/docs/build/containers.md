---
title: Containers
menuPosition: 2
author: skylerjokiel, rick-kirkham
editor: tylerbutler
---

The container is the primary unit of encapsulation in the Fluid Framework.
It enables a group of clients to access the same set of shared objects and co-author changes on those objects.
It is also a permission boundary ensuring visibility and access only to permitted clients.
A container is represented by the [FluidContainer]({{< relref "/docs/apis/fluid-static/fluidcontainer-class.md" >}}) type and consists of a collection of shared objects and APIs to manage the life cycle of those objects.

This article explains:

-   Creation, publication, and connection to containers.
-   Patterns for handling container life cycle.
-   Container services.

{{< callout note >}}

In this article the term "creating client" refers to the client on which a container is created.
When it is important to emphasize that a client is *not* the creating client, it is called a "subsequent client".
It is helpful to remember that "client" does not refer to a device or anything that persists between sessions with your application.
When a user closes your application, the client no longer exists: a new session is a new client.
So, when the creating client is closed, there is no longer any creating client.
The device is a subsequent client in all future sessions.

{{< /callout >}}

## Creating & connecting

Your code creates containers using APIs provided by a service-specific client library.
Each service-specific client library implements a common API for manipulating containers.
For example, the [Tinylicious library]({{< relref "Tinylicious" >}}) provides [these APIs]({{< relref "docs/apis/tinylicious-client.md" >}}) for the Tinylicious Fluid service.
These common APIs enable your code to specify what shared objects should live in the `FluidContainer`, and to connect to the container once it is created.

### Container schema

Your code must define a schema that represents the structure of the data within the container.
Only the data *values* are persisted in the Fluid service. The structure and data types are stored as a schema object on each client.
A schema can specify:

-   Some initial shared objects that are created as soon as the container is created, and are immediately and always available to all connected clients.
-   The types of shared objects that can be added to the container at runtime and made available for use by all connected clients.

As explained below, the same schema definition that is used to create the container must be provided when clients subsequently connect to the container. For more information about initial objects and dynamic object creation see [Data modeling]({{< relref "data-modeling.md" >}}).

This example schema defines two initial objects, `layout` and `text`, and declares that objects of the distributed data structure (DDS) types `SharedCell` and `SharedString` can be created at runtime.

```typescript
const schema = {
    initialObjects: {
        layout: SharedMap,
        text: SharedString
    },
    dynamicObjectTypes: [ SharedCell, SharedString ],
};
```

### Creating a container

Containers are created by passing the schema to the service-specific client's `createContainer` function.

```typescript {linenos=inline,hl_lines=[7,8]}
const schema = {
    initialObjects: {
        layout: SharedMap,
    },
};

const { container, services } =
    await client.createContainer(schema);
```

Notes:

-   The `client` object is defined by the service-specific client library. See the documentation for the service you are using for more details about how to use its service-specific client library.
-   It is a good practice to destructure the object that is returned by `createContainer` into its two main parts; `container` and `services`. For more about the `services` object, see [Container services](#container-services).

A newly created container is in an **unpublished** state. An unpublished container is stored on the local client only and therefore no data is shared with other clients yet. But the data in it can, and sometimes should be, edited while it is unpublished. See [Container states and events]({{< relref "container-states-events/index.md" >}}).

### Publishing a container

In order to publish the container to a service, code on the creating client calls the container object's `attach` method.

{{< callout note >}}

In the Fluid APIs, the terms "attach", "attached" and "detached" mean publish, published, and unpublished, respectively.

{{< /callout >}}

Once published, the Fluid container becomes an entity on Fluid service and subsequent clients can connect to it.

Invoking the container's `attach` method returns the unique identifier for the container.
Subsequent clients use this ID to connect to the container.

Note that once published, a container cannot be unpublished. (But it can be deleted. See [Deleting a container from the service]({{< relref "container-states-events/index.md#deleting-a-container-from-the-service" >}}).)

```typescript {linenos=inline,hl_lines=[10]}
const schema = {
    initialObjects: {
        layout: SharedMap,
    },
};

const { container, services } =
    await client.createContainer(schema);

const containerId = await container.attach();
```

In addition to publishing the container, the `attach` method also connects the creating client to the published container. See [Connecting to a container](#connecting-to-a-container) and [Connection status states]({{< relref "container-states-events/index.md#connection-status-states" >}}).

### Connecting to a container

The creating client connects to a container when it calls the container's `attach` method.
A subsequent client connects to a published container by calling the client's `getContainer` method.
The call must pass the `id` of the container as well as the exact same schema definition used to create the container.
The same container schema is required on all subsequent connections.

```typescript {linenos=inline}
const schema = {
    initialObjects: {
        layout: SharedMap,
    },
};
const { container, services } =
    await client.getContainer(/*container id*/, schema);
```

## Container states

{{< callout tip >}}

This section provides only basic information about the *most important* states that a container can be in. Details about *all* container states, including state diagrams, state management, editing management, and container event handling are in [Container states and events]({{< relref "container-states-events/index.md" >}}).

{{< /callout >}}

There are four types of states that a container can be in. Every container is in exactly one state of each of these types. The following shows the most important states within each type but are not complete lists.

-   **Publication status**:

    -   unpublished
    -   published

-   **Synchronization status**:

    -   dirty (on a given client)
    -   saved

-   **Connection status**:

    -   disconnected (from the Fluid service)
    -   connected

-   **Local readiness status**:

    -   ready
    -   disposed (on the client)

### Ready for editing

Your application's UI can enable users to edit the shared data objects in a container (but not necessarily share their edits) in any combination of states as long as the container's Local Readiness status is **ready**, although you may want to disable editing in some of these state combinations.

Changes made on a client are synchronized with the Fluid service and shared with other clients only when all of the following are true:

-   Publication status is **published**.
-   Connection status is **connected** (which can only be the case if the Local Readiness status is **ready**).

A rule of thumb is that local edits that are made when either of these conditions is not met will be synchronized with the Fluid service and the other clients whenever the container transitions into the **published** and **connected** states.

## Patterns for managing container lifecycle

### Create/connect separation

When creating and connecting to a container, it can be tempting to have a consistent code path for both creation and loading.

However, we generally recommend that creating and connecting to containers be separated. This provides a cleaner separation of responsibilities within the code itself. Also, in typical use-cases, a user will create a new container through some UI action that results in a redirect to another page whose sole responsibility is to connect to a container. All subsequent clients will load the container by navigating directly to that page.

The drawback of this approach is that when creating a container, the service connection needs to be established twice -- once for the container creation and once for the connection. This can introduce latency in the container creation process. For an example of a simple scenario in which it makes sense to combine the flows, see [Using Fluid with React]({{< relref "react.md" >}}).

### Multi-container example

Multiple Fluid containers can be loaded from an application or on a web page at the same time. There are two primary scenarios where an application would use multiple containers.

First, if your application loads two different experiences that have different underlying data structures. *Experience 1* may require a `SharedMap` and *Experience 2* may require a `SharedString`. To minimize the memory footprint of your application, your code can create two different container schemas and load only the schema that is needed. In this case your app has the capability of loading two different containers (two different schemas) but only loads one for a given user.

A more complex scenario involves loading two containers at once. Containers serve as a permissions boundary, so if you have cases where multiple users with different permissions are collaborating together, you may use multiple containers to ensure users have access only to what they should.
For example, consider an education application where multiple teachers collaborate with students. The students and teachers may have a shared view while the teachers may also have an additional private view on the side. In this scenario the students would be loading one container and the teachers would be loading two.

## Container services

When you create or connect to a container with `createContainer` or `getContainer`, the Fluid service will also return a service-specific *services* object.
This object contains references to useful services you can use to build richer applications.
An example of a container service is the [Audience]({{< relref "audience.md" >}}), which provides user information for clients that are connected to the container. See [Working with the audience]({{< relref "audience.md#working-with-the-audience" >}}) for more information.

<!-- AUTO-GENERATED-CONTENT:START (INCLUDE:path=../../../_includes/links.md) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated by embedding the referenced file contents. Do not update these generated contents directly. -->

<!-- Links -->

<!-- Concepts -->

[Fluid container]: {{< relref "containers.md" >}}
[Signals]: {{< relref "/docs/concepts/signals.md" >}}

<!-- Distributed Data Structures -->

[SharedCounter]: {{< relref "/docs/data-structures/counter.md" >}}
[SharedMap]: {{< relref "/docs/data-structures/map.md" >}}
[SharedString]: {{< relref "/docs/data-structures/string.md" >}}
[Sequences]:  {{< relref "/docs/data-structures/sequences.md" >}}

<!-- API links -->

[fluid-framework]: {{< relref "/docs/apis/fluid-framework.md" >}}
[@fluidframework/azure-client]: {{< relref "/docs/apis/azure-client.md" >}}
[@fluidframework/tinylicious-client]: {{< relref "/docs/apis/tinylicious-client.md" >}}

[AzureClient]: {{< relref "/docs/apis/azure-client/AzureClient-class.md" >}}
[TinyliciousClient]: {{< relref "/docs/apis/tinylicious-client/TinyliciousClient-class.md" >}}

[FluidContainer]: {{< relref "/docs/apis/fluid-static/fluidcontainer-class.md" >}}
[IFluidContainer]: {{< relref "/docs/apis/fluid-static/ifluidcontainer-interface.md" >}}

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
