---
title: Containers
menuPosition: 2
author: skylerjokiel
editor: tylerbutler
---

The container is the primary unit of encapsulation in the Fluid Framework. A container is represented by the `FluidContainer` type and consists of a collection of shared objects and APIs to manage the lifecyle of those objects.

This article will explain:

- How to create and load containers.
- The APIs to interact with them.
- The container lifecycle.

## Creating & loading

Your code creates containers using APIs provided by a service-specific client library. Each service-specific client library implements a common API for manipulating containers. For example, the Tinylicious library provides these APIs for the Tinylicious Fluid service. These common APIs enable your code to define the container schema (which specifies what kinds of shared objects are in the container) and retrieve the `FluidContainer` object.

### Container schema

Your code must define a schema that represents the structure of the data within the container. A schema can specify:

- Some initial shared objects that are created as soon as the container is, and are immediately and always available to all connected clients.
- The types of shared objects that can be added to the container at runtime and persisted in the container for use by all connected clients.

The same schema definition that is used to create the container must be provided when clients subsequently load the container. For more information about initial objects and dynamic object creation see [Data modeling]({{< relref "data-modeling.md" >}}).

This example schema defines two initial objects, `layout` and `text`, and declares the distributed data structures (DDSes) `SharedCell` and `SharedString` as shared object types that can be created at runtime.

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

Containers are created from the service-specific client's `createContainer` function. Your code must provide a configuration that is specific to the service and a schema object that defines the container schema. About this code note:

- `client` represents an object defined by the service-specific client library. See the documentation for the service you are using for more details about how to use its service-specific client library.
- It is a good practice to deconstruct the object that is returned by `createContainer` into its two main parts; `container` and `services`. For an example of the use of the latter, see [Working with the audience]({{< relref "audience.md#working-with-the-audience" >}}).

```typescript {linenos=inline,hl_lines=[7,8]}
const schema = {
    initialObjects: {
        layout: SharedMap,
    },
};

const { container, services } =
    await client.createContainer(schema);

const containerId = await container.attach();
```

### Attaching a container

A newly created container is in a *detached* state. This is the point where you can create initial data to populate your
shared objects if needed. A detached container is not connected to the Fluid service and no data is shared with other clients.

In order to attach the container to a service, call its `attach` function. Once *attached*, the Fluid container is
connected to the Fluid service and can be loaded by other clients.

Note that once attached, a container cannot be detached. Attach is a one-way operation. When loading an existing
container, the loaded container is always attached.

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

### Loading a container

To load the container created in the above section your code calls the client's `getContainer` method. The call must pass the `id` of the container to load as well as the exact same schema definition used when creating the container. The same container schema is required on all subsequent loads or the container will not be loaded correctly.

Note that when loading an existing container, the container is already attached.

```typescript {linenos=inline}
const schema = {
    initialObjects: {
        layout: SharedMap,
    },
};
const { container, services } =
    await client.getContainer(/*container id*/, schema);
```

### Deleting a container

Deleting a container is a service-specific feature, so you should refer to the documentation associated with the specific Fluid service you are using. See [Available Fluid Services]({{< relref "service-options.md" >}}) for more information about Fluid service options.

## Container lifecycle and manipulation

### attached/detached

Newly created containers begin in a *detached* state. A detached container is not connected to the Fluid service and no
data is shared with other clients. This is an ideal time to create initial data in your Fluid data model.

### connected/disconnected

The container exposes the connected state of the client and emits connected and disconnected events to notify the caller if the underlying connection is disrupted. Fluid will by default attempt to reconnect in case of lost/intermittent connectivity. However, `connect()` and `disconnect()` can be used to manually control the connection policy. Note about this code:

- `user.on("idle")` and `user.on("active")` are hypothetical event callbacks which fire if a user becomes idle or active respectively. They are for demonstration purposes only and are not provided by FluidFramework.

```typescript {linenos=inline}
const connectionState = container.connectionState;

container.on("disconnected", () => {
    // handle disconnected
    // prevent the user from editing to avoid data loss
});

container.on("connected", () => {
    // handle connected
    // enable editing if disabled
});

user.on("idle", () => {
    // Disconnect the container when idle to prevent unnecessary network traffic/COGS
    container.disconnect();
});

user.on("active", () => {
    // Connect the container when active to resume op processing
    container.connect();
});
```

### dispose

The container object may be disposed to remove any server connections and clean up registered events. Once a container is disposed, your code must call `getContainer` again if it needs to  be reloaded.

```typescript {linenos=inline}
container.dispose();

const disposed = container.disposed;

container.on("disposed", () => {
    // handle event cleanup to prevent memory leaks
});
```

### isDirty

A container is considered **dirty** if it has local changes that have not yet been acknowledged by the service. You should always check the `isDirty` flag before closing the container or navigating away from the page. Closing the container while `isDirty === true` may result in the loss of operations that have not yet been acknowledged by the service.

A container is considered dirty in the following cases:

1. The container has been created in the detached state, and either it has not been attached yet or it is in the process of being attached (container is in `attaching` state). If container is closed prior to being attached, host may never know if the file was created or not.
2. The container was attached, but it has local changes that have not yet been saved to service endpoint. This occurs as part of normal op flow where pending operation (changes) are awaiting acknowledgement from the service. In some cases this can be due to lack of network connection. If the network connection is down, it needs to be restored for the pending changes to be acknowledged.

In terms of user experience, keep in mind that `isDirty` flag will flicker as pending changes are awaiting and being acknowledgement. Therefore, the host may choose to incorporate some delay before interpreting the flag again, when basing the user experience off of its state.

```typescript {linenos=inline}
if(container.isDirty) {
  container.on("saved", () => {
    // safe to close the container
  });
}
```

### saved

The container emits the saved event to notify the caller that all the local changes have been acknowledged by the service and the document is marked as clean.

```typescript {linenos=inline}
container.on("saved", () => {
    // allow the user to edit
});
```

### dirty

The container emits the dirty event to notify the caller that there are local changes that have not been acknowledged by the service yet and the document is still in a dirty state.

```typescript {linenos=inline}
container.on("dirty", () => {
    // prevent the user from editing to avoid data loss
});
```

### Initial objects

Initial objects are shared objects that your code defines in a container's schema and which exist for the lifetime of the container.
These shared objects are exposed via the `initialObjects` property on the container.

```typescript {linenos=inline}
const schema = {
    initialObjects: {
        layout: SharedMap,
        text: SharedString
    },
}

// ...

const layout = container.initialObjects.layout;
const text = container.initialObjects.text;
```

For more information about initial objects see [Data modeling]({{< relref "data-modeling.md" >}}).

### create

The container also exposes a create function that enables creation of shared objects at runtime.

For more information about dynamic object creation see [Data modeling]({{< relref "data-modeling.md" >}}).

## Patterns for managing container lifecycle

### Create/load separation

When creating and loading a container, it can be tempting to have a consistent code path for both creation and loading.

However, we generally recommend that creating and loading containers be separated. This provides a cleaner separation of responsibilities within the code itself. Also, in typical use-cases, a user will create a new container through some UI action that results in a redirect to another page whose sole responsibility is to load a container. All subsequent users will load the container by navigating directly to that page.

The drawback of this approach is that when creating a container, the service connection needs to be established twice -- once for the container creation and once for the load. This can introduce latency in the container creation process. For an example of a simple scenario in which it makes sense to combine the flows, see [Using Fluid with React]({{< relref "react.md" >}}).

### Multi-container example

Multiple Fluid containers can be loaded from an application or on a Web page at the same time. There are two primary scenarios where an application would use multiple containers.

First, if your application loads two different experiences that have different underlying data structures. *Experience 1* may require a `SharedMap` and *Experience 2* may require a `SharedString`. To minimize the memory footprint of your application, your code can create two different container schemas and load only the schema that is needed. In this case your app has the capability of loading two different containers (two different schemas) but only loads one for a given user.

A more complex scenario involves loading two containers at once. Containers serve as a permissions boundary, so if you have cases where multiple users with different permissions are collaborating together, you may use multiple containers to ensure users have access only to what they should.
For example, consider an education application where multiple teachers collaborate with students. The students and teachers may have a shared view while the teachers may also have an additional private view on the side. In this scenario the students would be loading one container and the teachers would be loading two.

## Container services

When you load a container, the Fluid service will also return a service-specific *services* object. This object contains
references to useful services you can use to build richer apps. An example of a container service is the
[Audience]({{< relref "audience.md" >}}), which provides user information for clients that are connected to the container.

<!-- AUTO-GENERATED-CONTENT:START (INCLUDE:path=docs/_includes/links.md) -->
<!-- Links -->

<!-- Concepts -->

[Fluid container]: {{< relref "containers.md" >}}

<!-- Classes and interfaces -->

[FluidContainer]: {{< relref "fluidcontainer.md" >}}
[IFluidContainer]: {{< relref "ifluidcontainer.md" >}}
[SharedCounter]: {{< relref "/docs/data-structures/counter.md" >}}
[SharedMap]: {{< relref "/docs/data-structures/map.md" >}}
[SharedSequence]: {{< relref "sequences.md" >}}
[SharedString]: {{< relref "string.md" >}}

<!-- AUTO-GENERATED-CONTENT:END -->
