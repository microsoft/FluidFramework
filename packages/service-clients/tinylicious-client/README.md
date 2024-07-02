# @fluidframework/tinylicious-client

The tinylicious-client package provides a simple and powerful way to consume collaborative Fluid data with the Tinylicious service.

<!-- AUTO-GENERATED-CONTENT:START (README_DEPENDENCY_GUIDELINES_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Using Fluid Framework libraries

When taking a dependency on a Fluid Framework library's public APIs, we recommend using a `^` (caret) version range, such as `^1.3.4`.
While Fluid Framework libraries may use different ranges with interdependencies between other Fluid Framework libraries,
library consumers should always prefer `^`.

If using any of Fluid Framework's unstable APIs (for example, its `beta` APIs), we recommend using a more constrained version range, such as `~`.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## Using tinylicious-client

The tinylicious-client package has a default `TinyliciousClient` class that allows you to interact with Fluid.

```javascript
import { TinyliciousClient } from "@fluidframework/tinylicious-client";
```

## Instantiating TinyliciousClient

Fluid requires a backing service to enable collaborative communication. The TinyliciousClient instance will be instantitated against the Tinylicious service.

In the example below we are connecting to a locally running instance of our Tinylicious service running on port 7070 by filling out the optional `port` parameter in `TinyliciousConnectionConfig`.

```javascript
import { TinyliciousClient, TinyliciousConnectionConfig } from "@fluidframework/tinylicious-client";

const clientProps = { connection: { port: 7070 } };
const tinyliciousClient = new TinyliciousClient(clientProps);
```

## Fluid Containers

A Container instance is a organizational unit within Fluid. Each Container instance has a connection to the defined Fluid Service and contains an independent collection of collaborative objects.

Containers are created and identified by unique ids. Management and storage of these ideas are the responsibility of the developer.

## Defining Fluid Containers

Fluid Containers are defined by a schema. The schema includes initial properties of the Container as well as what collaborative objects can be dynamically created.

See [`ContainerSchema`](./src/types.ts) in [`./src/types/ts`](./src/types.ts) for details about the specific properties.

```javascript
const schema = {
	initialObjects: {
		/* ... */
	},
	dynamicObjectTypes: [
		/*...*/
	],
};
const tinyliciousClient = new TinyliciousClient();
const { container, services } = await tinyliciousClient.createContainer(schema, "2" /* compatibilityMode */);

// Set any default data on the container's `initialObjects` before attaching
// Returned ID can be used to fetch the container via `getContainer` below
const id = await container.attach();
```

## Using Fluid Containers

Using the default `TinyliciousClient` object the developer can create and get Fluid containers. Because Fluid needs to be connected to a server containers need to be created and retrieved asynchronously.

```javascript
import { TinyliciousClient } from "@fluidframework/tinylicious-client";

const tinyliciousClient = new TinyliciousClient(props);
const { container, services } = await tinyliciousClient.getContainer("_unique-id_", schema, "2" /* compatibilityMode */);
```

## Using initial objects

The most common way to use Fluid is through initial collaborative objects that are created when the Container is created.

> Note: Collaborative objects are referred to as LoadableObjects within Fluid. LoadableObjects are specific to Fluid and expose a collaborative interface. DistributedDataStructures and DataObjects are types of LoadableObjects.

`initialObjects` are loaded into memory when the Container is loaded and the developer can access them off the Container via the `initialObjects` property. The `initialObjects` property has the same signature as the Container schema.

```javascript
const schema = {
	initialObjects: {
		map1: SharedMap,
		text1: SharedString,
	},
};
const tinyliciousClient = new TinyliciousClient();
const { container, services } = await tinyliciousClient.getContainer("_unique-id_", schema, "2" /* compatibilityMode */);

const initialObjects = container.initialObjects;
const map1 = initialObjects.map1;
const text1 = initialObjects["text1"];
```

## Using dynamic objects

LoadableObjects can also be created dynamically during runtime. Dynamic object types need to be defined in the `dynamicObjectTypes` property of the ContainerSchema.

The Container has a `create` method that will create a new instance of the provided type. This instance will be local to the user until attached to another loadable object. Dynamic objects created this way should be stored in initialObjects, which are attached when the Container is created. When storing a loadable object you must store a reference to the object and not the object itself. To do this use the `handle` property on the loadable object.

Dynamic objects are loaded on-demand to optimize for data virtualization. To get the loadable object, first get the stored handle then resolve that handle.

```javascript
const schema = {
	initialObjects: {
		map1: SharedMap,
	},
	dynamicObjectTypes: [SharedString],
};
const tinyliciousClient = new TinyliciousClient();
const { container, services } = await tinyliciousClient.getContainer("_unique-id_", schema, "2" /* compatibilityMode */);
const map1 = container.initialObjects.map1;

const newText = await container.create(SharedString);
map1.set("text-unique-id", newText.handle);

// ...

const textHandle = map1.get("text-unique-id"); // Get the handle
const text = await map1.get(); // Resolve the handle to get the object

// or

const text = await map1.get("text-unique-id").get();
```

<!-- AUTO-GENERATED-CONTENT:START (README_TRADEMARK_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
