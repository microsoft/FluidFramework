# @fluidframework/azure-client

The azure-client package provides a simple and powerful way to consume collaborative Fluid data with the Azure Fluid Relay service (FRS).

## Using azure-client

The azure-client package has a `AzureClient` class that allows you to interact with Fluid.

```typescript
import { AzureClient } from "@fluidframework/azure-client";
```

## Instantiating AzureClient

Fluid requires a backing service to enable collaborative communication. The `AzureClient` supports both instantiating against a deployed FRS service instance for production scenarios, as well as against a local, in-memory service instance, known as Tinylicious, for development purposes.

NOTE: You can use one instance of the `AzureClient` to create/fetch multiple containers from the same FRS service instance.

In the example below we will walk through both connecting to a a live FRS service instance by providing the tenant ID and key that is uniquely generated for us when onboarding to the service, as well as using a tenant ID of "local" for development purposes to run our application against Tinylicious. We make use of `AzureFunctionTokenProvider` for token generation while running against a live FRS instance and `InsecureTokenProvider` to authenticate a given user for access to the service locally. The `AzureFunctionTokenProvider` is an implemention that fulfills the `ITokenProvider` interface without exposing the tenant key secret in client-side code.

### Backed Locally

To run Tinylicious on the default values of `localhost:7070`, please enter the following into a terminal window:
```
npx tinylicous
```

Now, with our local service running in the background, we need to connect the application to it. For this, we first need to create our `ITokenProvider` instance to authenticate the current user to the service. For this, we can use the `InsecureTokenProvider` where we can pass anything into the key (since we are running locally) and an object identifying the current user. Both our orderer and storage URLs will point to the domain and port that our Tinylicous instance is running at.

```typescript
import { AzureClient, AzureConnectionConfig } from "@fluidframework/azure-client";

const config: AzureConnectionConfig = {
    tenantId: "local",
    tokenProvider: new InsecureTokenProvider("fooBar", { id: "123", name: "Test User" }),
    orderer: "http://localhost:7070",
    storage: "http://localhost:7070",
};
const azureClient = new AzureClient(config);
```

### Backed by a Live FRS Instance
When running against a live FRS instance, we can use the same interface as we do locally but instead using the tenant ID, orderer, and storage URLs that were provided as part of the FRS onboarding process. To ensure that the secret doesn't get exposed, it is passed to a secure, backend Azure function from which the token is fetched. We pass the Azure Function URL appended by `/api/GetFrsToken` along with the current user object to `AzureFunctionTokenProvider`. Later on, in `AzureFunctionTokenProvider` we make an axios `GET` request call to the Azure function by passing in the tenantID, documentId and userID/userName as optional parameters. Azure function is responsible for mapping between the tenant ID to a tenant key secret to generate and sign the token such that the service will accept it.

```typescript
import { AzureClient, AzureConnectionConfig } from "@fluidframework/azure-client";

const config: AzureConnectionConfig = {
    tenantId: "YOUR-TENANT-ID-HERE",
    tokenProvider: new AzureFunctionTokenProvider("AZURE-FUNCTION-URL"+"/api/GetFrsToken", { userId: "test-user",userName: "Test User" }),
    orderer: "ENTER-ORDERER-URL-HERE",
    storage: "ENTER-STORAGE-URL-HERE",
};
const azureClient = new AzureClient(config);
```

## Fluid Containers

A Container instance is a organizational unit within Fluid. Each Container instance has a connection to the defined Fluid Service and contains a collection of collaborative objects.

Containers are created and identified by unique IDs. Management and storage of these IDs are the responsibility of the developer.

## Using Fluid Containers

Using the `AzureClient` object the developer can create and get Fluid containers. Because Fluid needs to be connected to a server, containers need to be created and retrieved asynchronously.

```typescript
import { AzureClient } from "@fluidframework/azure-client";

const azureClient = new AzureClient(config);
await azureClient.createContainer( { id: "_unique-id_" }, /* schema */);
const { fluidContainer, containerServices } = await azureClient.getContainer({ id: "_unique-id_" }, /* schema */);
```

NOTE: When using the `AzureClient` with tenant ID as "local", all containers that have been created will be deleted when the instance of the Tinylicious service (not client) that was run from the terminal window is closed. However, any containers created when running against the FRS service itself will be persisted. Container IDs can NOT be reused between Tinylicious and FRS to fetch back the same container.

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
const azureClient = new AzureClient(config);
await azureClient.createContainer({ id: "_unique-id_" }, schema);
const { fluidContainer, containerServices } = await azureClient.getContainer({ id: "_unique-id_" }, schema);
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
const { fluidContainer, containerServices } = await azureClient.getContainer({ id: "_unique-id_" }, schema);

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

const { fluidContainer, containerServices } = await azureClient.getContainer({ id: "_unique-id_" }, schema);
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
