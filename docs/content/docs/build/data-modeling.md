---
title: Data modeling
menuPosition: 3
author: skylerjokiel
editor: tylerbutler
---

Fluid offers flexible ways to model your collaborative data. You can declaratively define a static set of Fluid objects
using `initialObjects`, or, for more sophisticated scenarios, dynamically create Fluid objects at runtime.

## Defining `initialObjects`

The most straightforward way to use Fluid is by defining initial Fluid objects that are created when the
`FluidContainer` is created, and exist for the lifetime of the underlying container. `initialObjects` serve as a base
foundation for a Fluid *schema* -- a definition of the shape of your data.

`initialObjects` are always *connected* -- that is, they are connected to the Fluid service and are fully distributed.
You can access initial objects via the `initialObjects` property on the `FluidContainer`. The `initialObjects` property
at runtime has the same signature as the one you define in your declaration of `initialObjects.`

You must define at least one `initialObject`. In many cases `initialObjects` is sufficient to build a Fluid application.

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

A Fluid object can be created dynamically by the container at runtime. Dynamic objects are both created and loaded
dynamically and are always stored as references within another Fluid object. In other words, a container can create an
object dynamically, and you must store references to those objects within another Fluid object so that you can later
retrieve them.

### Creating a dynamic object

A `FluidContainer` object has a `create` function that takes a Fluid object type (that is, a distributed data structure
or `DataObject`) and will return a new Fluid object. The `FluidContainer` can only create types defined in the
`dynamicObjectTypes` section of the container schema.

Dynamically created objects are local only (in-memory) and need to be stored on a connected Fluid object before they are
shared with other clients.

```js
const schema = {
    /*...*/,
    dynamicObjectTypes: [ SharedCell, SharedMap ],
}

const { container, containerServices } = await client.getContainer(/*service config*/, schema);

const newCell = await container.create(SharedCell); // Create a new SharedCell
const newMap = await container.create(SharedMap); // Create a new SharedMap
```

{{% callout tip %}}
Another way to think about `initialObjects` and dynamic objects is as follows:

With `initialObjects`, you're telling Fluid both the type of the object *and* the key you'll use to later retrieve the
object. This is statically defined, so Fluid can create the object for you and ensure it's always available via the key
you defined.

On the other hand, with dynamic objects, you're telling Fluid what object types it can create as well as *how* to create
objects of those types, but that's all. Once you create a dynamic object using `container.create`, that objects is
in-memory only. If you want to load that Fluid object again later, you must store it within another Fluid object. In a
sense, you're defining the "key" to access that data again later, just as you did with `initialObjects`, but you define
it dynamically at runtime.

{{% /callout %}}

### Using handles to store and retrieve Fluid objects

All Fluid objects have a `handle` property that can be used to store and retrieve them from other Fluid objects. Objects created dynamically must be stored before they are collaborative. As you will see below, the act of storing a handle is what links the new dynamic object to the underlying data model and is how other clients learn that it exists.

Dynamically created objects need to be stored on an already connected Fluid object, so the most common case is to store them in an `initialObject`, because `initialObjects` are connected on creation. However, you can also store dynamic objects in other connected dynamic objects. In this sense Fluid objects are arbitrarily nestable.

When retrieving dynamically created objects you need to first get the object's handle then get the object from the handle. This reference based approach allows the Fluid Framework to virtualize the data underneath, only loading objects when they are requested.

The following example demonstrates dynamically creating a `SharedCell` and storing it in the `SharedMap` initial object
using the handle. It also demonstrates retrieving the `SharedCell` object from the `SharedMap` and listening for the new
`SharedCell` being added to the Map.

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

Dynamic objects are more difficult to work with than `initialObjects`, but are especially important for large data sets where portions of the data are virtualized. Because dynamic objects are loaded into memory on demand, using them can reduce boot time of your application by delaying when the objects are loaded. Dynamic objects are also not strictly defined in the container schema. This enables you to create containers with flexible, user-generated schemas.

An example where this is useful is building a collaborative storyboarding application. In this scenario you can have a large number of individual boards that make up the storyboard. By using a dynamic Fluid object for each board you can load them on demand as the user accesses them, instead of having to load them all in memory at once.

<!-- AUTO-GENERATED-CONTENT:START (INCLUDE:path=docs/_includes/links.md) -->
<!-- Links -->

<!-- Concepts -->

[Fluid container]: {{< relref "containers-runtime.md" >}}

<!-- Packages -->

[Aqueduct]: {{< relref "/docs/apis/aqueduct.md" >}}
[fluid-framework]: {{< relref "/docs/apis/fluid-framework.md" >}}

<!-- Classes and interfaces -->

[ContainerRuntimeFactoryWithDefaultDataStore]: {{< relref "/docs/apis/aqueduct/containerruntimefactorywithdefaultdatastore.md" >}}
[DataObject]: {{< relref "/docs/apis/aqueduct/dataobject.md" >}}
[DataObjectFactory]: {{< relref "/docs/apis/aqueduct/dataobjectfactory.md" >}}
[Ink]: {{< relref "/docs/apis/ink/ink.md" >}}
[PureDataObject]: {{< relref "/docs/apis/aqueduct/puredataobject.md" >}}
[PureDataObjectFactory]: {{< relref "/docs/apis/aqueduct/puredataobjectfactory.md" >}}
[Quorum]: {{< relref "/docs/apis/protocol-base/quorum.md" >}}
[SharedCell]: {{< relref "/docs/apis/cell/sharedcell.md" >}}
[SharedCounter]: {{< relref "SharedCounter" >}}
[SharedDirectory]: {{< relref "/docs/apis/map/shareddirectory.md" >}}
[SharedMap]: {{< relref "/docs/apis/map/sharedmap.md" >}}
[SharedMatrix]: {{< relref "SharedMatrix" >}}
[SharedNumberSequence]: {{< relref "SharedNumberSequence" >}}
[SharedObjectSequence]: {{< relref "/docs/apis/sequence/sharedobjectsequence.md" >}}
[SharedSequence]: {{< relref "SharedSequence" >}}
[SharedString]: {{< relref "SharedString" >}}

<!-- Sequence methods -->

[sequence.insert]: {{< relref "/docs/apis/sequence/sharedsequence.md#sequence-sharedsequence-insert-Method" >}}
[sequence.getItems]: {{< relref "/docs/apis/sequence/sharedsequence.md#sequence-sharedsequence-getitems-Method" >}}
[sequence.remove]: {{< relref "/docs/apis/sequence/sharedsequence.md#sequence-sharedsequence-getitems-Method" >}}
[sequenceDeltaEvent]: {{< relref "/docs/apis/sequence/sequencedeltaevent.md" >}}

<!-- AUTO-GENERATED-CONTENT:END -->
