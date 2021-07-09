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

You must define a schema that represents the structure of the data within your container. A schema can include `initialObjects` that are always available and types that can be dynamically created by the container at runtime. The same schema definition must be provided for creation and subsequent loading of the container. For more information on `initialObjects` and dynamic object creation see [Data modeling](./data-modeling.md).

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

### Loading a container

To load the container created in the above section you must provide the service config as well as the exact same schema definition. The same container schema is required on all subsequent loads or the container will not be loaded correctly.

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
    await client.getContainer(/*service config*/, schema);

### Attaching a container

Once the `createContainer` or `loadContainer` function calls complete, the returned container is _attached_ -- that is, it  is connected to the Fluid service -- and ready to power collaboration. 

We are currently working on an advanced scenario where containers can be created locally before persisting them to the server. The primary use case for this is if a client want's to draft the initial state of a container before other collaborators enter.

### Deleting a container

Deleting a container is a service-specific feature, so you should refer to the documentation associated with the specific Fluid service you are using. See [Available Fluid Services]({{< relref "service-options.md" >}}) for more information about Fluid service options.

## Container lifecycle and manipulation

### connected/disconnected

The container exposes the connected state of the client and emits connected and disconnected events to notify the caller if the underlying connection is disrupted. Fluid will by default attempt to reconnect in case of lost/intermittent connectivity.

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

The container object may be disposed to remove any server connections and clean up registered events. Once a container is disposed, you must call `getContainer` again if you want to re-load it.

```typescript
container.dispose();

const disposed = container.disposed();

container.on("disposed", () => {
    // handle event cleanup to prevent memory leaks
});
```

### initialObjects

`initialObjects` are the base set of `LoadableObjects` in a container. They exist for the lifetime of the container and are guaranteed to be available and loadable. They are defined via the container schema and match the signature on the schema. 

For more information about `initialObjects` see [Data modeling](data-modeling.md).

### create

The container also exposes a create function that allows dynamic `LoadableObject` creation. This enables containers to create Fluid objects dynamically at runtime.

For more information about dynamic object creation see [Data modeling](data-modeling.md).

## Patterns for managing container lifecycle

### Create/load separation

When creating and loading a container our basic guidance is to separate the two flows. This provides a cleaner separation of responsibilities within the code it self. From a scenario perspective it manifests as the creator going through a explicit creation process that results in a redirect to a new page who's sole responsibility is to load the container. All users will load the container through this subsequent flow.

The drawback of this approach is that when creating a container, the service connection needs to be established twice -- once for the container creation and once for the load. This can introduce latency in the container creation process.

### Multi-container example

Multiple Fluid containers can be loaded from an application or on a Web page at the same time. There are two primary scenarios where an application would use multiple containers.

First, if your application loads two different experiences that have different underlying data structures. _Experience 1_ may require a `SharedMap` and _Experience 2_ may require a `SharedString`. To minimize the memory footprint of your application you can create two different container schemas and load only the schema you need. In this case your app can load two different containers (two different schemas) but you only load one at a time.

The second scenario involves loading two containers at once. Currently, all services enable permissioning at the container level, so we can use containers as a natural boundary for restricting access. An example scenario for this would be building an education app where mutliple teachers are gathering with students. The students and teachers may have a shared view while the teachers may also want to have an additional private view on the side. In this scenario the students would be loading one container and the teachers would be loading two.

{{% callout tip %}}

Use the `name` property on the container to help manage multiple containers.

{{% /callout %}}
