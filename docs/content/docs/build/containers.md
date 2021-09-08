---
title: Containers
menuPosition: 2
author: skylerjokiel
editor: tylerbutler
---

## Overview

The container is the primary unit of encapsulation in the Fluid Framework. A container is represented by the `FluidContainer` type and consists of a collection of shared objects and APIs to manage the lifecycle of those objects.

This documentation will explain how to create and load containers, the APIs to interact with them, and the overall container lifecycle.

## Creating & loading

You can create containers using APIs provided by a service-specific client package. Each service-specific client package contains a common API for manipulating containers. For example, the `tinylicious-client` package provides these APIs for the Tinylicious Fluid service. These common APIs enable you to define the container schema and retrieve the `FluidContainer` object.

In the below scenarios, `client` represents the service-specific client. See the documentation for the service you are using for more details about how to use the service-specific client.

### Container schema

You must define a schema that represents the structure of the data within your container. A schema can include `initialObjects` that are always available and types that can be dynamically created by the container at runtime. The same schema definition must be provided for creation and subsequent loading of the container. For more information on `initialObjects` and dynamic object creation see
[Data modeling]({{< relref "data-modeling.md" >}}).

This example schema defines two initial objects, and declares `SharedCell` and `SharedString` as shared object types that can be dynamically created at runtime.

```typescript {linenos=inline}
const containerSchema = {
    initialObjects: {
        layout: SharedMap,
        text: SharedString
    },
    dynamicObjectTypes: [ SharedCell, SharedString ],
};
```

### Creating a container

Containers are created from the service-specific client's `createContainer` function. You must provide a config that is specific to the service and a schema object that defines the container schema.

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

To load a container you must provide the service config as well as the exact same schema definition. The same container
schema is required on all subsequent loads or the container will not be loaded correctly.

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

The container exposes the connected state of the client and emits connected and disconnected events to notify the caller if the underlying connection is disrupted. Fluid will by default attempt to reconnect in case of lost/intermittent connectivity.

```typescript {linenos=inline}
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

```typescript {linenos=inline}
container.dispose();

const disposed = container.disposed();

container.on("disposed", () => {
    // handle event cleanup to prevent memory leaks
});
```

### initialObjects

`initialObjects` are shared objects that you define in a container's schema and exist for the lifetime of the container. These shared objects are exposed via the `initialObjects` property on the container.

```typescript {linenos=inline}
const schema = {
    name: "example-container",
    initialObjects: {
        layout: SharedMap,
        text: SharedString
    },
}

// ...

const layout = container.initialObjects.layout;
const text = container.initialObjects.text;
```

For more information about `initialObjects` see [Data modeling](data-modeling.md).

### create

The container also exposes a create function that allows dynamic creation of shared objects. This enables containers to create Fluid objects dynamically at runtime.

For more information about dynamic object creation see [Data modeling](data-modeling.md).

## Patterns for managing container lifecycle

### Create/load separation

When creating and loading a container, it can be tempting to have a consistent code path for both creation and loading. However, it is generally recommended to separate the two flows. This provides a cleaner separation of responsibilities within the code itself. Also, in typical use-cases, a user will create a new container through some UI action that results in a redirect to another page whose sole responsibility is to load a container. All subsequent users will load the container by navigating directly to that page.

The drawback of this approach is that when creating a container, the service connection needs to be established twice -- once for the container creation and once for the load. This can introduce latency in the container creation process.

### Multi-container example

Multiple Fluid containers can be loaded from an application or on a Web page at the same time. There are two primary scenarios where an application would use multiple containers.

First, if your application loads two different experiences that have different underlying data structures. *Experience 1* may require a `SharedMap` and *Experience 2* may require a `SharedString`. To minimize the memory footprint of your application you can create two different container schemas and load only the schema you need. In this case your app can load two different containers (two different schemas) but you only load one at a time.

A more complex scenario involves loading two containers at once. Containers serve as a permissions boundary, so if you have cases where multiple users with different permissions are collaborating together, you may use multiple containers to ensure users have access only to what they should.
For example, consider an education application where multiple teachers collaborate with students. The students and teachers may have a shared view while the teachers may also have an additional private view on the side. In this scenario the students would be loading one container and the teachers would be loading two.

{{% callout tip %}}

Use the `name` property on the container to help manage multiple containers.

{{% /callout %}}

## Container services

When you load a container, the Fluid service will also return a service-specific *services* object. This object contains
references to useful services you can use to build richer apps. An example of a container service is the
[Audience]({{< relref "audience.md" >}}), which provides user information for clients that are connected to the container.

<!-- AUTO-GENERATED-CONTENT:START (INCLUDE:path=docs/_includes/links.md) -->
<!-- Links -->

<!-- Concepts -->

[Fluid container]: {{< relref "containers.md" >}}

<!-- Classes and interfaces -->

[ContainerRuntimeFactoryWithDefaultDataStore]: {{< relref "containerruntimefactorywithdefaultdatastore.md" >}}
[DataObject]: {{< relref "dataobject.md" >}}
[DataObjectFactory]: {{< relref "dataobjectfactory.md" >}}
[PureDataObject]: {{< relref "puredataobject.md" >}}
[PureDataObjectFactory]: {{< relref "puredataobjectfactory.md" >}}
[SharedCounter]: {{< relref "/docs/data-structures/counter.md" >}}
[SharedMap]: {{< relref "/docs/data-structures/map.md" >}}
[SharedNumberSequence]: {{< relref "sequences.md#sharedobjectsequence-and-sharednumbersequence" >}}
[SharedObjectSequence]: {{< relref "sequences.md#sharedobjectsequence-and-sharednumbersequence" >}}
[SharedSequence]: {{< relref "sequences.md" >}}
[SharedString]: {{< relref "string.md" >}}
[TaskManager]: {{< relref "/docs/data-structures/task-manager.md" >}}

<!-- AUTO-GENERATED-CONTENT:END -->
