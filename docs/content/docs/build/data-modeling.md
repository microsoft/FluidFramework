---
title: Data modeling
menuPosition: 3
---

Fluid offers two different ways to model your data object. You can do so statically on `FluidContainer` creation via `initialObjects`, or dynamically after the `FluidContainer` has been created. The exact same set of object types can be created statically or dynamically. DistributedDataStructures (DDSes) and DataObjects are both supported types and are generically referred to as `LoadableObjects`.

## Defining `initialObjects`

The most common way to use Fluid is through initial collaborative objects that are created when the `FluidContainer` is created.

`initialObjects` are always _connected_ -- that is, they are connected to the Fluid service are fully collaborative -- and are loaded into memory when the `FluidContainer` is loaded. You can access them via the `initialObjects` property on the `FluidContainer`. The `initialObjects` are defined in the container schema and have the same signature as defined in the schema.

### When to use `initialObjects`

`initialObjects` are the most common way to use Fluid and set the foundation for how the remainder of the data is structured. In most basic cases `initialObjects` should be sufficient for building applications.

### Versioning `initialObjects`

`initialObjects` are defined on creation and exist for the lifetime of the underlying container. The work to version and upgrade the `initialObjects` schema is currently under development.

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

const { container, containerServices } = await client.createContainer(/*service config*/, schema);

const initialObjects = container.initialObjects;
const map = container.initialObjects.customMap;
const cell = container.initialObjects["custom-cell"];
```

## Dynamic objects

A `LoadableObject` can be created dynamically by the container at runtime. Dynamic objects are both created and loaded dynamically and are always stored as references within another `LoadableObject`. In other words, a container can create an object dynamically, and you must store references to those objects within another `LoadableObject`.

### Creating a dynamic object

A `FluidContainer` object has a `create` function that takes a `LoadableObject` type and will return a new `LoadableObject`. The `FluidContainer` can only create types defined in the `dynamicObjectTypes` section of the container schema. 

Dynamically created objects are local only (in-memory) and need to be stored on a connected `LoadableObject` before being collaborative.

```typescript
const schema = {
    /*...*/,
    dynamicObjectTypes: [ SharedCell, SharedMap ],
}

const { container, containerServices } = await client.getContainer(/*service config*/, schema);

const newCell = await container.create(SharedCell); // Create a new SharedCell
const newMap = await container.create(SharedMap); // Create a new SharedMap
```

### Using handles to store and retrieve Fluid objects

All `LoadableObjects` have a `handle` property that can be used to store and retrieve them from other `LoadableObjects`. Objects created dynamically must be stored before they are collaborative. As you will see below, the act of storing a handle is what links the new dynamic object to the underlying data model and is how other clients learn that it exists.

Dynamically created objects need to be stored on an already connected `LoadableObject`, so the most common case is to store them in an `initialObject`, because `initialObjects` are connected on creation. However, you can also store dynamic objects in other connected dynamic objects. In this sense `LoadableObjects` are arbitrarily nestable.

When retrieving dynamically created objects you need to first get the object's handle then get the object from the handle. This reference based approach allows the Fluid Framework to virtualize the data underneath, only loading objects when they are requested.

```typescript
const schema = {
    name: "example-container",
    initialObjects: {
        map: SharedMap,
    },
    dynamicObjectTypes: [ SharedCell ],
}

const { container, containerServices } = await client.getContainer(/*service config*/, schema);
const map = container.initialObjects.map;

const newCell = await container.create(SharedCell); // Create a new SharedCell
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

### When to use dynamic objects
 
Dynamic objects are more difficult to work with than `initialObjects`, but are especially important for large data sets where portions of the data are virtualized. Because dynamic objects are loaded into memory on demand, using them can reduce boot time of your application by delaying when the objects are loaded.

Dynamic objects are also not strictly defined in the container schema. This enables you to create containers with flexible, user-generated schemas.

### Garbage collection on de-referenced objects

Fluid automatically removes unreferenced objects from document snapshots. Cleaning up unreferenced data reduces the snapshot size, which leads to better download times and increases boot performance of a container.

Dynamic objects can be de-referenced by deleting the value from the parent object. When using the `SharedMap` deleting the handle from the key will de-reference the object and trigger it to be garbage collected.

## Patterns for modeling data

### When to use initialObjects vs dynamicObjects

### When to use one vs multiple objects

### Data objects are nestable

## Versioning and upgrading schema
