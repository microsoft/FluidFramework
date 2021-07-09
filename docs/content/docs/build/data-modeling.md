---
title: Data modeling
menuPosition: 3
---

Fluid offers two different ways to model your data object. You can do so statically on `FluidContainer` creation via `initialObjects`, or dynamically after the `FluidContainer` has been created. The exact same set of object types can be created statically or dynamically. DistributedDataStructures (DDSes) and DataObjects are both supported types and are generically referred to as `LoadableObjects`.

## Defining `initialObjects`

The most common way to use Fluid is through initial collaborative objects that are created when the `FluidContainer` is created.

`initialObjects` are always connected and are loaded into memory when the `FluidContainer` is loaded. You can access them via the  `initialObjects` property on the `FluidContainer`. The `initialObjects` are defined in the container schema and have the same signature as defined in the schema.

### When to use `initialObjects`

`initialObjects` are the most common way to use Fluid and set the foundation for how the remainder of the data is structured. In most basic cases `initialObjects` should be sufficient for building applications.

### Versioning `initialObjects`

`initialObjects` are defined on creation and exist for the lifetime of the underlying document. The work to version and upgrade this object set is currently under development.

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

A `LoadableObject` can be created dynamically during runtime. Dynamic objects are both created and loaded dynamically and are always stored as references within another `LoadableObject`.

### How to create a dynamic object

The `FluidContainer` object has a `create` function that takes a `LoadableObject` type and will create a new `LoadableObject`. The `FluidContainer` only knows how to create types defined in the `dynamicObjectTypes`. 

Dynamically created objects are in memory (local) only and need to be stored on a connected `LoadableObject` before being collaborative. See the next section for more on storing and retrieving dynamic objects.

```typescript
const schema = {
    /*...*/,
    dynamicObjectTypes: [ SharedCell, SharedMap ],
}

const { container, containerServices } = await client.getContainer(/*service config*/, schema);

const newCell = await container.create(SharedCell); // Create a new SharedCell
const newMap = await container.create(SharedMap); // Create a new SharedMap
```

### How to use handles to store and retrieve objects

`LoadableObjects` have a `handle` property that we will use to store and retrieve them from other `LoadableObjects`. Objects created dynamically must be stored before they are collaborative. As you will see below, the act of storing a handle is what links the new dynamic object to the underlying data model and is how other clients will be aware that it exists.

Dynamically created objects need to be stored on an already connected object. The most common case it to store it on an initial object, because they are connected on creation, but you can also store new objects to other connect dynamic objects. In this sense `LoadableObjects` are nestable.

When retrieving the object you need to first get the handle then get the object from the handle. This reference based approach allows the Fluid Framework to virtualize the data under the hood; only loading objects when they are requested. 

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
 
Dynamic objects are best used when you have large data sets and want to virtualize portions of it. Dynamic objects are loaded into memory on demand using them can reduce boot time. 

Dynamic objects are also not strictly defined in the container schema. This can make them more flexible when considering

### Garbage collection on de-referenced objects

Fluid automatically handles cleaning up unused objects from the latest document snapshot. Cleaning up unused data reduces the download time and increases boot performance.

Dynamic objects can be de-referenced by deleting the value from the parent object. When using the `SharedMap` deleting the handle from the key will de-reference the object and trigger it to be garbage collected.

## Patterns for modeling data

### When to use initialObjects vs dynamicObjects

### When to use one vs multiple objects

### Data objects are nestable

## Versioning and upgrading schema
