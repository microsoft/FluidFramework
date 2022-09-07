---
title: Data modeling
menuPosition: 3
author: skylerjokiel
editor: tylerbutler
---

Fluid offers flexible ways to model your collaborative data. Your application can declaratively define a set of shared objects
that are immediately and always available to all clients; or, for more complex scenarios, your application can create shared objects at runtime only when a user takes a particular path through the application.

## Defining initial objects

The most straightforward way to use Fluid is by defining **initial objects** that are created when the
[Fluid container][] is created, and exist for the lifetime of the container. Initial objects serve as a base
foundation for a Fluid *schema* -- a definition of the shape of the data.

Initial objects are always *connected* -- that is, they are connected to the Fluid service and are fully distributed.
Your code can access initial objects via the `initialObjects` property on the `FluidContainer` object.

Your code must define at least one `initialObject`. In many cases one or more initial objects is sufficient to build a Fluid application.

### Example usage

The example below creates a new container with a `SharedMap` and a `SharedCell` as `initialObjects`.

About this code note:

- `client` represents an object defined by the service-specific client library. See the documentation for the service you are using for more details about how to use its service-specific client library.
- It is a good practice to deconstruct the object that is returned by `createContainer` into its two main parts; `container` and `services`. For an example of the use of the latter, see [Working with the audience]({{< relref "audience.md#working-with-the-audience" >}}).

```typescript
const schema = {
    initialObjects: {
        customMap: SharedMap,
        "custom-cell": SharedCell,
    }
}

const { container, services } = await client.createContainer(schema);

const initialObjects = container.initialObjects;
const map = container.initialObjects.customMap;
const cell = container.initialObjects["custom-cell"];
```

## Dynamic objects

A shared object can be created by the container at runtime. **Dynamic objects** are both created and loaded
dynamically. When your code creates an object dynamically, it must store a reference to the object within another shared object so that your code can later
retrieve it.

### Creating a dynamic object

A `FluidContainer` object has a `create` function that takes a shared object type (that is, a distributed data structure (DDS) type
or a Data Object type) and returns a new shared object. But only shared object types that are specified in the schema's `dynamicObjectTypes` array can be dynamically created.

Dynamically created objects are local only (in-memory) and cannot be shared with other clients unless a reference to each of them is stored in a connected shared object.

```js
const schema = {
    /*...*/,
    dynamicObjectTypes: [ SharedCell, SharedMap ],
}

const { container, services } = await client.getContainer(id, schema);

const newCell = await container.create(SharedCell); // Create a new SharedCell
const newMap = await container.create(SharedMap); // Create a new SharedMap
```

{{% callout tip %}}
Another way to think about `initialObjects` and dynamic objects is as follows:

With `initialObjects`, you're telling Fluid both the type of the object *and* the key you'll use to later retrieve the
object. This is statically defined, so Fluid can create the object for you and ensure it's always available via the key
your code defined.

On the other hand, with dynamic objects, you're telling Fluid what object types it can create, but that's all. When your code creates a dynamic object using `container.create`, that object is in-memory only. If you want to load that shared object again later, your code must store a reference to it within another shared object. In a
sense, you're defining the "key" to access that data again later, just as you did with `initialObjects`, but you define
it dynamically at runtime.

{{% /callout %}}

### Using handles to store and retrieve shared objects

All shared objects supported by Fluid have a `handle` property that can be used to store and retrieve them from other shared objects. Objects created dynamically must be stored before they are collaborative. As you will see below, the act of storing a handle is what links the new dynamic object to the underlying data model and is how other clients learn that it exists.

Dynamically created objects need to be stored on an already connected shared object, so the most common case is to store references to them in an initial object property, because initial objects are connected on creation. However, you can also store dynamic objects in other connected dynamic objects. In this sense shared objects are arbitrarily nestable. But the hierarchy of referenced objects must rest in an initial object that holds the references to the first level of dynamic objects. So, there is always at least one initial object in every container.

When retrieving dynamically created objects, your code needs to first get the object's handle then get the object from the handle. This reference-based approach enables the Fluid Framework to virtualize the data underneath, only loading objects when they are requested.

The following example demonstrates dynamically creating a `SharedCell` and storing it in the `SharedMap` initial object
using the handle. It also demonstrates retrieving the `SharedCell` object from the `SharedMap` and listening for the new
`SharedCell` being added to the SharedMap.

```typescript
const schema = {
    initialObjects: {
        map: SharedMap,
    },
    dynamicObjectTypes: [ SharedCell ],
}

const { container, services } = await client.getContainer(id, schema);
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

For more information about handles see [Handles]({{< relref "handles.md" >}}).

### When to use dynamic objects

Dynamic objects are more difficult to work with than initial objects, but are especially valuable in two scenarios:

- When the app has a very large data set. Because dynamic objects are loaded into memory on demand, using them can reduce boot time of your application by delaying when the objects are loaded.
- When the data needed by the app will vary depending on choices made by the user. Dynamic objects are also not strictly defined in the container schema. This enables your app to create containers with flexible, user-generated schemas.

An example where this is useful is building a collaborative storyboarding application. In this scenario, you can have a large number of individual boards that make up the storyboard. By using a dynamic shared object for each board your code can load the boards on demand as the user accesses them, instead of having to load them all in memory at once.

<!-- AUTO-GENERATED-CONTENT:START (INCLUDE:path=docs/_includes/links.md) -->
<!-- Links -->

<!-- Concepts -->

[Fluid container]: {{< relref "containers.md" >}}

<!-- Distributed Data Structures -->

[SharedCounter]: {{< relref "/docs/data-structures/counter.md" >}}
[SharedMap]: {{< relref "/docs/data-structures/map.md" >}}
[SharedSequence]: {{< relref "/docs/data-structures/sequences.md" >}}
[SharedString]: {{< relref "/docs/data-structures/string.md" >}}

<!-- API links -->

[fluid-framework]: {{< relref "/docs/apis/fluid-framework.md" >}}
[@fluidframework/azure-client]: {{< relref "/docs/apis/azure-client.md" >}}
[@fluidframework/tinylicious-client]: {{< relref "/docs/apis/tinylicious-client.md" >}}

[AzureClient]: {{< relref "/docs/apis/azure-client/AzureClient-class.md" >}}
[TinyliciousClient]: {{< relref "/docs/apis/tinylicious-client/TinyliciousClient-class.md" >}}

[FluidContainer]: {{< relref "/docs/apis/fluid-static/fluidcontainer-class.md" >}}
[IFluidContainer]: {{< relref "/docs/apis/fluid-static/ifluidcontainer-interface.md" >}}

<!-- AUTO-GENERATED-CONTENT:END -->
