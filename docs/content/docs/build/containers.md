---
title: Containers
menuPosition: 2
---

## Overview

The container is the primary unit of encapsulation in the Fluid Framework. A container is represented by the `FluidContainer` type and consists of a collection of Loadable Objects and APIs to manage the lifecyle of those objects.

This documentation will explain how to create and load containers, the APIs to interact with them, and the overall container lifecycle.```

## Creating & loading

You can create containers using APIs provided by a service-specific client package. Each service-specific client package contains a common API for manipulating containers. For example, the `tinylicious-client` package provides these APIs for the Tinylicious Fluid service. These common APIs enable you to define the container schema and retrieve the `FluidContainer` object.

In the below scenarios, `client` represents the service-specific client. See the documentation for the service you are using for more details about how to use the service-specific client.

### Container schema

The container schema defines the data that the container instance knows about. It includes `initialObjects` that will synchronously loaded and always available. It also includes a definition of types that can be dynamically created. The same schema definition must be provided for both. For more information on `initialObjects` and dynamically cration see [Data modeling](./data-modeling.md)

```typescript
const schema = {
    name: "example-container",
    initialObjects: {
        layout: SharedDirectory,
        text: SharedString
    },
    dynamicObjectTypes: [ SharedCell, SharedString ],
}
```

### How to create a container

Containers are created from the service-specific client's `createContainer` function. You must provide a config that is specific to the service and a schema object that defines the container schema.

```typescript {hl_lines=[10]}
const schema = {
    name: "example-container",
    initialObjects: {
        layout: SharedDirectory,
        text: SharedString
    },
    dynamicObjectTypes: [ SharedCell, SharedString ],
}
const { container, containerServices} =
    await client.createContainer(/*service config*/, schema);

### How to load a container

To load the container created in the above section you must provide the service config as well as the exact same schema definition. The same container schema is required on all subsequent loads or the container will not be loaded correctly.

```typescript
const schema = {
    name: "example-container",
    initialObjects: {
        layout: SharedDirectory,
        text: SharedString
    },
    dynamicObjectTypes: [ SharedCell, SharedString ],
}
const { container, containerServices} = await client.getContainer(/*service config*/, schema);
```

### Attaching a container

Once the `createContainer` or `loadContainer` function calls complete, the returned container is _attached_ -- that is, it  is connected to the Fluid service -- and ready to power collaboration. 

We are currently working on an advanced scenario where containers can be created locally before persisting them to the server. The primary use case for this is if a client want's to draft the initial state of a container before other collaborators enter.

### Deleting a container

Deleting a container is a server specific policy and you should refer to the documentation associated with the specific Fluid service you are using.

## Interaction & lifecycle

### connected/disconnected

The container exposes current connected state and emits connected and disconnected events to notify the caller if the underlying connection is disrupted. Fluid will by default attempt to reconnect in case of lost/intermittent connectivity.

```typescript
const connected = container.connected();

container.on("disconnected", () => {
    // handle disconnected
    // prevent the user from editing to avoid data loss
});

container.on("connected", () => {
    // handle connected
    // enable editing if disabled
});
```

### dispose

The container exposes functionality that allow cleanup of the container object. Calling dispose will remove any server connections and clean up registered events. Once a container is dispose it cannot be re-hydrated. Connecting to the same container requires another `getContainer(...)` call.

```typescript
container.dispose();

const disposed = container.disposed();

container.on("disposed", () => {
    // handle event cleanup to prevent memory leaks
});
```

### initialObjects

`initialObjects` are the base set of `LoadableObjects` in a container. They exist for the lifetime of the container and are guaranteed to be available and loadable. They are defined via the container schema and match the signature on the schema. 

For more on `initialObjects` see [Data modeling](data-modeling.md)

### create

The container also exposes a create function that allows dynamic `LoadableObject` creation.

For more on dynamic object creation see [Data modeling](data-modeling.md)

## Patterns for managing container lifecycle

### Create/load separation

When creating and loading a container our basic guidance is to separate the two flows. This provides a cleaner separation of responsibilities within the code it self. From a scenario perspective it manifests as the creator going through a explicit creation process that results in a redirect to a new page who's sole responsibility is to load the container. All users will load the container through this subsequent flow.

It should be noted that the downside of this approach is that the connection needs to be established twice. Once for the creation and once for the load. Depending on your scenario you should choose the pattern that works best for you.

### Multi-container example

Multiple containers can be loaded from an app, or on a page, at the same time. There are two primary scenarios where you application would be using multiple containers.

First, is if your application loads two different experiences that have different underlying data structures. `Experience 1` may require a `SharedMap` and `Experience 2` may requires a `SharedString`. To minimize our memory footprint we can create two different container schemas and load only what we need. In this scenario our app can load two different containers but we are only choosing to load one at a time.

The second scenario involves loading two containers at once. Currently, all services enable permissioning at the container level, so we can use containers as a natural boundary for restricting access. An example scenario for this would be building an education app where mutliple teachers are gathering with students. The students and teachers may have a shared view while the teachers may also want to have an additional private view on the side. In this scenario the students would be loading one container and the teachers would be loading two.

{{% callout tip %}}

Using the name property on the container can be helpful when managing multiple containers.

{{% /callout %}}
