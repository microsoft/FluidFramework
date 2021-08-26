---
title: Containers
menuPosition: 2
author: skylerjokiel
editor: tylerbutler
---

## Overview

The container is the primary unit of encapsulation in the Fluid Framework. A container is represented by the `FluidContainer` type and consists of a collection of shared objects and APIs to manage the lifecyle of those objects.

This documentation will explain how to create and load containers, the APIs to interact with them, and the overall container lifecycle.

## Creating & loading

You can create containers using APIs provided by a service-specific client package. Each service-specific client package contains a common API for manipulating containers. For example, the `tinylicious-client` package provides these APIs for the Tinylicious Fluid service. These common APIs enable you to define the container schema and retrieve the `FluidContainer` object.

In the below scenarios, `client` represents the service-specific client. See the documentation for the service you are using for more details about how to use the service-specific client.

### Container schema

You must define a schema that represents the structure of the data within your container. A schema can include `initialObjects` that are always available and types that can be dynamically created by the container at runtime. The same schema definition must be provided for creation and subsequent loading of the container. For more information on `initialObjects` and dynamic object creation see [Data modeling](./data-modeling.md).

This example schema defines two initial objects, and declares `SharedCell` and `SharedString` as shared object types that can be dynamically created at runtime.

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

### Creating a container

Containers are created from the service-specific client's `createContainer` function. You must provide a config that is specific to the service and a schema object that defines the container schema.

```typescript {hl_lines=[10]}
const schema = {
    name: "example-container",
    initialObjects: {
        layout: SharedMap,
    },
}
const { container, containerServices} =
    await client.createContainer(/*service config*/, schema);
```

### Loading a container

To load the container created in the above section you must provide the service config as well as the exact same schema definition. The same container schema is required on all subsequent loads or the container will not be loaded correctly.

```typescript {hl_lines=[10]}
const schema = {
    name: "example-container",
    initialObjects: {
        layout: SharedMap,
    },
}
const { container, containerServices} =
    await client.getContainer(/*service config*/, schema);
```

### Attaching a container

Once the `createContainer` or `loadContainer` function calls complete, the returned container is *attached* -- that is, it is connected to the Fluid service -- and ready to power collaboration.

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

`initialObjects` are shared objects that you define in a container's schema and exist for the lifetime of the container. These shared objects are exposed via the `initialObjects` property on the container.

```typescript
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

A more complex scenario involves loading two containers at once. Containers serve as a permissioning boundary, so if you have cases where multiple users with different permissions are collaborating together, you may use multiple containers to ensure users have access only to what they should.
For example, consider an education application where multiple teachers collaborate with students. The students and teachers may have a shared view while the teachers may also have an additional private view on the side. In this scenario the students would be loading one container and the teachers would be loading two.

{{% callout tip %}}

Use the `name` property on the container to help manage multiple containers.

{{% /callout %}}

<!-- AUTO-GENERATED-CONTENT:START (INCLUDE:path=docs/_includes/links.md) -->
<!-- Links -->

<!-- Concepts -->

[Fluid container]: {{< relref "containers.md" >}}

<!-- Classes and interfaces -->

[ContainerRuntimeFactoryWithDefaultDataStore]: {{< relref "containerruntimefactorywithdefaultdatastore.md" >}}
[DataObject]: {{< relref "dataobject.md" >}}
[DataObjectFactory]: {{< relref "dataobjectfactory.md" >}}
[Ink]: {{< relref "ink.md" >}}
[PureDataObject]: {{< relref "puredataobject.md" >}}
[PureDataObjectFactory]: {{< relref "puredataobjectfactory.md" >}}
[SharedCell]: {{< relref "cell.md" >}}
[SharedCounter]: {{< relref "counter.md" >}}
[SharedDirectory]: {{< relref "directory.md" >}}
[SharedMap]: {{< relref "map.md" >}}
[SharedMatrix]: {{< relref "matrix.md" >}}
[SharedNumberSequence]: {{< relref "sequence.md" >}}
[SharedObjectSequence]: {{< relref "sequence.md" >}}
[SharedSequence]: {{< relref "sequence.md" >}}
[SharedString]: {{< relref "string.md" >}}

<!-- AUTO-GENERATED-CONTENT:END -->
