# @fluid-experimental/tinylicious-client

The tinylicious-client package provides a simple and powerful way to consume collaborative Fluid data with the Tinylicious service.

This package is marked as experimental and currently under development. The API surface is currently under going drastic braking changes with no guarantees on compatibility.

## Using tinylicious-client

The tinylicious-client package has a default `TinyliciousClient` class that allows you to interact with Fluid.

```javascript
import TinyliciousClient from "@fluid-experimental/tinylicious-client";
```

## Instantiating TinyliciousClient

Fluid requires a backing service to enable collaborative communication. The TinyliciousClient instance will be instantitated against the Tinylicious service.

In the example below we are connecting to a locally running instance of our Tinylicious service running on port 7070 by filling out the optional `port` parameter in `TinyliciousConnectionConfig`.

```javascript
import TinyliciousClient, { TinyliciousConnectionConfig } from "@fluid-experimental/tinylicious-client";

const config: TinyliciousConnectionConfig = { port: 7070 };
const tinyliciousClient = new TinyliciousClient(config);
```

## Fluid Containers

A Container instance is a organizational unit within Fluid. Each Container instance has a connection to the defined Fluid Service and contains an independent collection of collaborative objects.

Containers are created and identified by unique ids. Management and storage of these ideas are the responsibility of the developer.

## Using Fluid Containers

Using the default `TinyliciousClient` object the developer can create and get Fluid containers. Because Fluid needs to be connected to a server containers need to be created and retrieved asynchronously.

```javascript
import TinyliciousClient from "@fluid-experimental/tinylicious-client";

const tinyliciousClient = new TinyliciousClient(config);
await tinyliciousClient.createContainer( { id: "_unique-id_" }, /* schema */);
const { fluidContainer, containerServices } = await tinyliciousClient.getContainer({ id: "_unique-id_" }, /* schema */);
```

## Defining Fluid Containers

Fluid Containers are defined by a schema. The schema includes initial properties of the Container as well as what collaborative objects can be dynamically created.

See [`ContainerSchema`](./src/types.ts) in [`./src/types/ts`](./src/types.ts) for details about the specific properties.

```javascript
const schema = {
    name: "my-container",
    initialObjects: {
        /* ... */
    },
    dynamicObjectTypes: [ /*...*/ ],
}
const tinyliciousClient = new TinyliciousClient();
await tinyliciousClient.createContainer({ id: "_unique-id_" }, schema);
const { fluidContainer, containerServices } = await tinyliciousClient.getContainer({ id: "_unique-id_" }, schema);
```

## Using initial objects

The most common way to use Fluid is through initial collaborative objects that are created when the Container is created.

> Note: Collaborative objects are referred to as LoadableObjects within Fluid. LoadableObjects are specific to Fluid and expose a collaborative interface. DistributedDataStructures and DataObjects are types of LoadableObjects.

`initialObjects` are loaded into memory when the Container is loaded and the developer can access them off the Container via the `initialObjects` property. The `initialObjects` property has the same signature as the Container schema.

```javascript
const schema = {
    name: "my-container",
    initialObjects: {
        map1: SharedMap,
        pair1: KeyValueDataObject,
    }
}
const tinyliciousClient = new TinyliciousClient();
const { fluidContainer, containerServices } = await tinyliciousClient.getContainer({ id: "_unique-id_" }, schema);

const initialObjects = container.initialObjects;
const map1 = initialObjects.map1;
const pair1 = initialObjects["pair1"];
```

## Using dynamic objects

LoadableObjects can also be created dynamically during runtime. Dynamic object types need to be defined in the  `dynamicObjectTypes` property of the ContainerSchema.

The Container has a `create` method that will create a new instance of the provided type. This instance will be local to the user until attached to another LoadableObject. Dynamic objects created this way should be stored in initialObjects, which are attached when the Container is created. When storing a LoadableObject you must store a reference to the object and not the object itself. To do this use the `handle` property on the LoadableObject.

Dynamic objects are loaded on-demand to optimize for data virtualization. To get the LoadableObject, first get the stored handle then resolve that handle.

```javascript
const schema = {
    name: "my-container",
    initialObjects: {
        map1: SharedMap,
    },
    dynamicObjectTypes: [ KeyValueDataObject ],
}
const tinyliciousClient = new TinyliciousClient();
const { fluidContainer, containerServices } = await tinyliciousClient.getContainer({ id: "_unique-id_" }, schema);
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
