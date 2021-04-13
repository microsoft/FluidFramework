# @fluid-experimental/fluid-static

The fluid-static package provides a simple and powerful way to consume collaborative Fluid data.

This package is marked as experimental and currently under development. The API surface is currently under going drastic braking changes with no guarantees on compatibility.

## Using fluid-static

The fluid-static package has a default `Fluid` object that allows you to interact with Fluid.

```javascript
import Fluid from "@fluid-experimental/fluid-static";
```

## Initializing Fluid

Fluid requires a backing service to enable collaborative communication. Before you start interacting with Fluid you need to initialize Fluid with the service you will be connecting to.

In the example below we are connecting the a locally running instance of our Tinylicious service.

```javascript
import Fluid from "@fluid-experimental/fluid-static";
import { TinyliciousService } from "@fluid-experimental/get-container";

const service = new TinyliciousService();
Fluid.init(service);
```

## Fluid Containers

A Container instance is a organizational unit within Fluid. Each Container instance has a connection to the defined Fluid Service and contains an independent collection of collaborative objects.

Containers are created and identified by unique ids. Management and storage of these ideas are the responsibility of the developer.

## Using Fluid Containers

Using the default `Fluid` object the developer can create and get Fluid containers. Because Fluid needs to be connected to a server containers need to be created and retrieved asynchronously.

```javascript
import Fluid from "@fluid-experimental/fluid-static";

await Fluid.createContainer("_unique-id_", /* config */);
const container = await Fluid.getContainer("_unique-id_", /* config */);
```

## Defining Fluid Containers

Fluid Containers are defined by a config. The config includes initial properties of the Container as well as what collaborative objects can be dynamically created.

See [`ContainerConfig`](./src/types.ts) in [`./src/types/ts`](./src/types.ts) for details about the specific properties.

```javascript
const config = {
    name: "my-container",
    initialObjects: {
        /* ... */
    },
    dynamicDataTypes: [ /*...*/ ],
}
await Fluid.createContainer("_unique-id_", config);
const container = await Fluid.getContainer("_unique-id_", config);
```

## Using initial objects

The most common way to use Fluid is through initial collaborative objects that are created when the Container is created.

> Note: Collaborative objects are referred to as LoadableObjects within Fluid. LoadableObjects are specific to Fluid and expose a collaborative interface. DistributedDataStructures and DataObjects are types of LoadableObjects.

`initialObjects` are loaded into memory when the Container is loaded and the developer can access them off the Container via the `initialObjects` property. The `initialObjects` property has the same signature as the Container config.

```javascript
const config = {
    name: "my-container",
    initialObjects: {
        map1: SharedMap,
        pair1: KeyValueDataObject,
    }
}

const container = await Fluid.getContainer("_unique-id_", config);

const initialObjects = container.initialObjects;
const map1 = initialObjects.map1;
const pair1 = initialObjects["pair1"];
```

## Using dynamic objects

LoadableObjects can also be created dynamically during runtime. Dynamic object types need to be defined in the  `dynamicObjectTypes` property of the ContainerConfig.

The Container has a `create` method that will create a new instance of the provided type. This instance will be local to the user until attached to another LoadableObject. Dynamic objects created this way should be stored in initialObjects, which are attached when the Container is created. When storing a LoadableObject you must store a reference to the object and not the object itself. To do this use the `handle` property on the LoadableObject.

Dynamic objects are loaded on-demand to optimize for data virtualization. To get the LoadableObject, first get the stored handle then resolve that handle.

```javascript
const config = {
    name: "my-container",
    initialObjects: {
        map1: SharedMap,
    },
    dynamicObjectTypes: [ KeyValueDataObject ],
}

const container = await Fluid.getContainer("_unique-id_", config);
const map1 = container.initialObjects.map1;

const newPair = await container.create(KeyValueDataObject);
map1.set("pair-unique-id", newPair.handle);

// ...

const pairHandle = map1.get("pair-unique-id"); // Get the handle
const pair = await map1.get(); // Resolve the handle to get the object

// or

const pair = await map1.get("pair-unique-id").get();
```

See [GitHub](https://github.com/microsoft/FluidFramework) for more details on the Fluid Framework and packages within.
