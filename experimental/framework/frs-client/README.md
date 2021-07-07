# @fluid-experimental/frs-client

The frs-client package provides a simple and powerful way to consume collaborative Fluid data with the Frs service.

This package is marked as experimental and currently under development. The API surface is currently under going drastic breaking changes with no guarantees on compatibility.

## Using frs-client

The frs-client package has a `FrsClient` class that allows you to interact with Fluid.

```typescript
import { FrsClient } from "@fluid-experimental/frs-client";
```

## Instantiating FrsClient

Fluid requires a backing service to enable collaborative communication. The `FrsClient` supports both instantiating against a deployed FRS service instance for production scenarios, as well as against a local, in-memory service instance, known as Tinylicious, for development purposes.

NOTE: You can use one instance of the `FrsClient` to create/fetch multiple containers from the same FRS service instance.

In the example below we will walk through both connecting to a a live FRS service instance by providing the tenantId and key that is uniquely generated for us when onboarding to the service, as well as using a tenantId of "local" for development purposes to run our application against Tinylicious. In both cases, we also pass a insecure token provider to authenticate a given user for access to the service. Prior to publishing an app to production, it is recommended to replace the `InsecureTokenProvider` with an implemention that fulfills the `ITokenProvider` interface without exposing the tenant key secret in client-side code.

### Backed Locally

To run Tinylicious on the default values of `localhost:7070`, please enter the following into a terminal window:
```
npx tinylicous
```

Now, with our local service running in the background, we need to connect the application to it. For this, we first need to create our `ITokenProvider` instance to authenticate the current user to the service. For this, we can use the `InsecureTokenProvider` where we can pass anything into the key (since we are running locally) and an object identifying the current user.
Both our orderer and storage URLs will point to the domain and port that our Tinylicous instance is running at.

```typescript
import { FrsClient, FrsConnectionConfig } from "@fluid-experimental/frs-client";

const config: FrsConnectionConfig = {
    tenantId: "local",
    tokenProvider: new InsecureTokenProvider("fooBar", { id: "123", name: "Test User" }),
    orderer: "http://localhost:7070",
    storage: "http://localhost:7070",
};
const frsClient = new FrsClient(config);
```

### Backed by a Live FRS Instance
When running against a live FRS instance, we can use the same interface as we do locally but instead using the tenant ID, orderer, and storage URLs that were provided as part of the FRS onboarding process. Each tenant ID maps to a tenant key secret that can be passed to the `InsecureTokenProvider` to generate and sign the token such that the service will accept it. To ensure that the secret doesn't get exposed, this should be replaced with another implementation of `ITokenProvider` that fetches the token from a secure, developer-provided backend service prior to releasing to production.

```typescript
import { FrsClient, FrsConnectionConfig } from "@fluid-experimental/frs-client";

const config: FrsConnectionConfig = { 
    tenantId: "YOUR-TENANT-ID-HERE",
    tokenProvider: new InsecureTokenProvider("YOUR-TENANT-ID-HERE" { id: "123", name: "Test User" }),
    orderer: "https://alfred.eus-1.canary.frs.azure.com",
    storage: "https://historian.eus-1.canary.frs.azure.com",
};
const frsClient = new FrsClient(config);
```

## Fluid Containers

A Container instance is a organizational unit within Fluid. Each Container instance has a connection to the defined Fluid Service and contains a collection of collaborative objects.

Containers are created and identified by unique IDs. Management and storage of these IDs are the responsibility of the developer.

## Using Fluid Containers

Using the `FrsClient` object the developer can create and get Fluid containers. Because Fluid needs to be connected to a server, containers need to be created and retrieved asynchronously.

```typescript
import { FrsClient } from "@fluid-experimental/frs-client";

const frsClient = new FrsClient(config);
await frsClient.createContainer( { id: "_unique-id_" }, /* schema */);
const { fluidContainer, containerServices } = await frsClient.getContainer({ id: "_unique-id_" }, /* schema */);
```

NOTE: When using the `FrsClient` with tenant ID as "local", all containers that have been created will be deleted when the instance of the Tinylicious service (not client) that was run from the terminal window is closed. However, any containers created when running against the FRS service itself will be persisted. Container IDs can NOT be reused between Tinylicious and FRS to fetch back the same container.

## Defining Fluid Containers

Fluid Containers are defined by a schema. The schema includes initial properties of the Container as well as what collaborative objects can be dynamically created.

See [`ContainerSchema`](./src/types.ts) in [`./src/types/ts`](./src/types.ts) for details about the specific properties.

```typescript
const schema = {
    name: "my-container",
    initialObjects: {
        /* ... */
    },
    dynamicObjectTypes: [ /*...*/ ],
}
const frsClient = new FrsClient(config);
await frsClient.createContainer({ id: "_unique-id_" }, schema);
const { fluidContainer, containerServices } = await frsClient.getContainer({ id: "_unique-id_" }, schema);
```

## Using initial objects

The most common way to use Fluid is through initial collaborative objects that are created when the Container is created. DistributedDataStructures and DataObjects are both supported types of collaborative objects.

`initialObjects` are loaded into memory when the Container is loaded and the developer can access them via the Container's `initialObjects` property. The `initialObjects` property has the same signature as the Container schema.

```typescript
// Define the keys and types of the initial list of collaborative objects. Here, we are using a SharedMap DDS on key "map1" and a KeyValueDataObject on key "pair1"
const schema = {
    name: "my-container",
    initialObjects: {
        map1: SharedMap,
        pair1: KeyValueDataObject,
    }
}

// Fetch back the container that had been created earlier with the same ID and schema
const { fluidContainer, containerServices } = await frsClient.getContainer({ id: "_unique-id_" }, schema);

// Get our list of initial objects that we had defined in the schema. initialObjects here will have the same signature
const initialObjects = fluidContainer.initialObjects;
// Use the keys that we had set in the schema to load the individiual objects
const map1 = initialObjects.map1;
const pair1 = initialObjects["pair1"];
```

## Using dynamic objects

LoadableObjects can also be created dynamically during runtime. Dynamic object types need to be defined in the  `dynamicObjectTypes` property of the ContainerSchema.

The Container has a `create` method that will create a new instance of the provided type. This instance will be local to the user until attached to another LoadableObject. Dynamic objects created this way should be stored in initialObjects, which are attached when the Container is created. When storing a LoadableObject you must store a reference to the object and not the object itself. To do this use the `handle` property on the LoadableObject.

Dynamic objects are loaded on-demand to optimize for data virtualization. To get the LoadableObject, first get the stored handle then resolve that handle.

```typescript
const schema = {
    name: "my-container",
    initialObjects: {
        map1: SharedMap,
    },
    dynamicObjectTypes: [ KeyValueDataObject ],
}

const { fluidContainer, containerServices } = await frsClient.getContainer({ id: "_unique-id_" }, schema);
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
