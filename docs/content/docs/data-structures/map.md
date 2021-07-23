---
title: SharedMap
menuPosition: 4
---
## Introduction

The `SharedMap` distributed data structure (DDS) is designed to be a collaborative version of the [Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map) built-in object that is provided in JavaScript. It uses the same API, but ensures that any edits being made to the object are simultaneously transmitted to all clients. For example, in a traditional `Map`, setting a key would only set it on the local object. In a `SharedMap`, the moment one client sets that key, that update is automatically sent to all of the other connected clients who will update their local state with the new remote change. From a development standpoint, this allows you to develop against the `SharedMap` DDS as you would with a traditional `Map`, while ensuring that the data being updated is synced between all clients with all of the logic for managing and merging the changes abstracted away.

For additional background on DDSes and a general overview of their design, please take a look [here]({{< relref "dds.md" >}}).

## Creation

There are two paths to create an instance of the `SharedMap`:
1.  Using the [FluidContainer]({{< relref "containers.md" >}}) for when you'd like to directly interface with the `SharedMap` in your application
2. Using the DDS API directly for when you'd like to use it within your own custom data object

### Using FluidContainer

The `FluidContainer` provides us with a container schema for defining which DDSes we would like to load from it. It provides two separate fields for establishing an initial roster of objects and dynamically creating new ones. For general guidance on using the `ContainerSchema`, please see [here]({{< relref "data-modeling.md" >}}) and for guidance on how to create/load a container using a service-specific client, please see [here]({{< relref "containers.md#creating--loading" >}}).

Let's take a look at how we would specifically use the `ContainerSchema` for `SharedMap`.

The following example loads a `SharedMap` as part of the initial roster of objects we have available in the container.

```javascript
const schema = {
    name: "example-container",
    initialObjects: {
        customMap: SharedMap,
    }
}

const { fluidContainer, containerServices } = await client.createContainer(/*service config*/, schema);

const map = fluidContainer.initialObjects.customMap;
```

At this point, we can directly start using the `map` object within our application. Including the `SharedMap` as part of initial objects ensures that the DDS is available the moment the async call to `createContainer` finishes.

Similarly, if we are loading an existing container, the process stays largely identical with the only difference being that we use `getContainer` instead of `createContainer`.

```javascript
const schema = {
    name: "example-container",
    initialObjects: {
        customMap: SharedMap,
    }
}

const { fluidContainer, containerServices } = await client.getContainer(/*service config*/, schema);

const map = fluidContainer.initialObjects.customMap;
```

Finally, if we'd like to dynamically create `SharedMap` instances as part of the application lifecycle (i.e. if there are user interactions in the applications that require a new DDS to be created at runtime), we can add the `SharedMap` type to the `dynamicObjectTypes` field in the schema and call the container's `create` function.

```javascript
const schema = {
    /*...*/,
    dynamicObjectTypes: [ SharedMap ]
}

const { fluidContainer, containerServices } = await client.getContainer(/*service config*/, schema);

const newMap = await container.create(SharedMap); // Create a new SharedMap
```

Once the async call to `create` returns, we can treat it the same as we were using the `SharedMap` instances from our initial objects above. The only caveat here is that we will need to maintain a pointer to our newly created object. To store it in another `SharedMap`, please see the **Storing shared objects** section below and for general guidance on storing DDS references as handles, please see [here]({{< relref "dds.md#creating-and-storing-distributed-data-structures" >}})

### Using the DDS API

A `SharedMap` instance can also be created from within your own custom data object. Each extension of the `DataObject` class has access to its own `runtime` that manages the object's own data store. `SharedMap` provides a static `create` function on its API that accepts this runtime and will provide you with a new instance of the DDS.

```javascript
const newMap = SharedMap.create(this.runtime, id);
```

`DataObject` classes also provides by default a `root` object, of type `ISharedDirectory`, that is always available. The `SharedMap` itself also provides a `handle` property that can be thought of as a serializable way to store it. Now that you have a way to serialize the map and a place where to put it, you can do the following to store the map in the `root`:
```javascript
const newMapKey = "uniqueMapId";
this.root.set(newMapKey, newMap.handle);
```
And then, we can load it back in the following manner:
```javascript
const newMapHandle = this.root.get<IFluidHandle<SharedCounter>>(newMapKey);

const newMapLoaded = await newMapHandle.get();
```
`newMapLoaded` now points to the same DDS as our initial `newMap`

## API Functionality

The `SharedMap` object provides a number of functions to allow you to edit the key/value pairs stored on the object. As stated earlier, these are intended to match the `Map` API. However, the keys used in `SharedMap` must be strings. Each edit will also trigger a `valueChanged` event which we will discuss in the **Events** section below.

- `set(key, value)` - Used for updating the value stored at `key` with the new provided value
- `get(key)` - Returns the latest value stored on the key or `undefined` if it does not exist
- `has(key)` - Checks to see if the key is available. This can be used as a boolean check prior to using `get` to avoid returning an `undefined` value
- `keys()` - Returns all the keys that have been set for this map
- `entries()` - Returns an iterator for all values stored on the map. This can be easily converted into an array by doing `Array.from(this.map.entries())`
- `delete(key)` - Removes the key from the map
{{< callout note >}}

When removing a key from the `SharedMap`, please use the `delete` function instead of using `set` with `value` as `undefined`. The latter will not remove the key from the object and it will still be returned when developers call `keys` or `entries`

{{< /callout >}}
- `forEach(callbackFn)` - Applies the provided function to each entry in the map. For example, the following will print out all of the key/value pairs in the map
```javascript
this.map.forEach((value, key) => console.log(`${key}-${value}`));
```

- `clear()` - Removes all data from the map, deleting all of the keys and values stored within it

## Eventing

## Usage guides

### Storing primitives

### Storing objects

### Storing shared objects

## Gotchas