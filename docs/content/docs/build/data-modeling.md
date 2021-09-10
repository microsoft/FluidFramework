---
title: Data modeling
menuPosition: 3
author: skylerjokiel
editor: tylerbutler
---

Fluid offers flexible ways to model your collaborative data. Shared objects can be declaratively defined in the `initialObjects` or dynamically created at runtime.

## Defining `initialObjects`

The most straightforward way to use Fluid is by defining initial shared objects that are created when the `FluidContainer` is created, and exist for the lifetime of the underlying container.

`initialObjects` are always *connected* -- that is, they are connected to the Fluid service and are fully collaborative. You can access initial objects via the `initialObjects` property on the `FluidContainer`. The `initialObjects` property has the same signature as defined in the schema.

### When to use `initialObjects`

`initialObjects` are the most straightforward way to use Fluid and serve as a base foundation for a Fluid schema. Your schema must include one initial object and in many cases `initialObjects` is sufficient to build a Fluid application.

### Example usage

The example below creates a new container with a `SharedMap` and a `SharedCell` as `initialObjects`.

```typescript
const schema = {
    name: "example-container",
    initialObjects: {
        customMap: SharedMap,
        "custom-cell": SharedCell,
    }
}

const { fluidContainer, containerServices } = await client.createContainer(/*service config*/, schema);

const initialObjects = fluidContainer.initialObjects;
const map = fluidContainer.initialObjects.customMap;
const cell = fluidContainer.initialObjects["custom-cell"];
```

## Dynamic objects

A shared object can be created dynamically by the container at runtime. Dynamic objects are both created and loaded dynamically and are always stored as references within another shared object. In other words, a container can create an object dynamically, and you must store references to those objects within another shared object.

### Creating a dynamic object

A `FluidContainer` object has a `create` function that takes a shared object type and will return a new shared object. The `FluidContainer` can only create types defined in the `dynamicObjectTypes` section of the container schema.

Dynamically created objects are local only (in-memory) and need to be stored on a connected shared object before being collaborative.

```typescript
const schema = {
    /*...*/,
    dynamicObjectTypes: [ SharedCell, SharedMap ],
}

const { fluidContainer, containerServices } = await client.getContainer(/*service config*/, schema);

const newCell = await fluidContainer.create(SharedCell); // Create a new SharedCell
const newMap = await fluidContainer.create(SharedMap); // Create a new SharedMap
```

### Using handles to store and retrieve Fluid objects

All shared objects have a `handle` property that can be used to store and retrieve them from other shared objects. Objects created dynamically must be stored before they are collaborative. As you will see below, the act of storing a handle is what links the new dynamic object to the underlying data model and is how other clients learn that it exists.

Dynamically created objects need to be stored on an already connected shared object, so the most common case is to store them in an `initialObject`, because `initialObjects` are connected on creation. However, you can also store dynamic objects in other connected dynamic objects. In this sense shared objects are arbitrarily nestable.

When retrieving dynamically created objects you need to first get the object's handle then get the object from the handle. This reference based approach allows the Fluid Framework to virtualize the data underneath, only loading objects when they are requested.

This example shows creating a new `SharedCell` and storing it in the `SharedMap` initial object using the handle. It also demonstrates retrieving the `SharedCell` object from the `SharedMap` and listening for the new `SharedCell` being added to the Map.

```typescript
const schema = {
    name: "example-container",
    initialObjects: {
        map: SharedMap,
    },
    dynamicObjectTypes: [ SharedCell ],
}

const { fluidContainer, containerServices } = await client.getContainer(/*service config*/, schema);
const map = fluidContainer.initialObjects.map;

const newCell = await fluidContainer.create(SharedCell); // Create a new SharedCell
map.set("cell-id", newCell.handle); // Attach the new SharedCell

// ...

const cellHandle = map.get("cell-id"); // Get the handle
const cell = await cellHandle.get(); // Resolve the handle to get the object

// or

const cell = await map.get("cell-id").get(); // Get and resolve handle

// Listening for new dynamic objects
map.on("valueChanged", (changed) => {
    if (changed.key === "cell-id") {
        const handle = map.get(changed.key);
        handle.get().then((cell) => {
            // ...
        });
    }
}
```

For more information about handles see [Handles]({{< relref "handles.md" >}}).

### When to use dynamic objects

Dynamic objects are more difficult to work with than `initialObjects`, but are especially important for large data sets where portions of the data are virtualized. Because dynamic objects are loaded into memory on demand, using them can reduce boot time of your application by delaying when the objects are loaded. Dynamic objects are also not strictly defined in the container schema. This enables you to create containers with flexible, user-generated schemas.

An example where this is useful is building a collaborative storyboarding application. In this scenario you can have a large number of individual boards that make up the storyboard. By using a dynamic shared object for each board you can load them on demand as the user accesses them, instead of having to load them all in memory at once.

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
