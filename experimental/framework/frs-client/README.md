# @fluid-experimental/frs-client

The frs-client package provides a simple and powerful way to consume collaborative Fluid data with the Frs service.

This package is marked as experimental and currently under development. The API surface is currently under going drastic breaking changes with no guarantees on compatibility.

## Using frs-client

The frs-client package has a `FrsClient` static class that allows you to interact with Fluid.

```javascript
import { FrsClient } from "@fluid-experimental/frs-client";
```

## Initializing FrsClient

Fluid requires a backing service to enable collaborative communication. The FrsClient instance will be instantiated against the FRS service.

In the example below we are connecting to the FRS service by providing the tenantId and key that is uniquely generated for us when onboarding to the service, and the orderer and storage servers we wish to connect to. We can also optionally pass in our own user details instead of having the client designate a random GUID and a token provider for authentication.

```javascript
import { FrsClient, FrsConnectionConfig } from "@fluid-experimental/frs-client";

const config: FrsConnectionConfig = { 
    tenantId: "",
    key: "",
    orderer: "",
    storage: "",
};
FrsClient.init(config);
```

## Fluid Containers

A Container instance is a organizational unit within Fluid. Each Container instance has a connection to the defined Fluid Service and contains a collection of collaborative objects.

Containers are created and identified by unique IDs. Management and storage of these IDs are the responsibility of the developer.

## Using Fluid Containers

Using the `FrsClient` object the developer can create and get Fluid containers. Because Fluid needs to be connected to a server, containers need to be created and retrieved asynchronously.

```javascript
import { FrsClient } from "@fluid-experimental/frs-client";

await FrsClient.createContainer( { id: "_unique-id_" }, /* schema */);
const [container, containerServices] = await FrsClient.getContainer({ id: "_unique-id_" }, /* schema */);
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
await FrsClient.createContainer({ id: "_unique-id_" }, schema);
const [container, containerServices] = await FrsClient.getContainer({ id: "_unique-id_" }, schema);
```

## Using initial objects

The most common way to use Fluid is through initial collaborative objects that are created when the Container is created. DistributedDataStructures and DataObjects are both supported types of collaborative objects.

`initialObjects` are loaded into memory when the Container is loaded and the developer can access them via the Container's `initialObjects` property. The `initialObjects` property has the same signature as the Container schema.

```javascript
// Define the keys and types of the initial list of collaborative objects. Here, we are using a SharedMap DDS on key "map1" and a KeyValueDataObject on key "pair1"
const schema = {
    name: "my-container",
    initialObjects: {
        map1: SharedMap,
        pair1: KeyValueDataObject,
    }
}

// Fetch back the container that had been created earlier with the same ID and schema
const [container, containerServices] = await FrsClient.getContainer({ id: "_unique-id_" }, schema);

// Get our list of initial objects that we had defined in the schema. initialObjects here will have the same signature
const initialObjects = container.initialObjects;
// Use the keys that we had set in the schema to load the individiual objects
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

const [container, containerServices] = await FrsClient.getContainer({ id: "_unique-id_" }, schema);
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
