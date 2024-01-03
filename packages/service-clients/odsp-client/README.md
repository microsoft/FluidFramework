# @fluid-experimental/odsp-client

The odsp-client package provides a simple and powerful way to consume collaborative Fluid data with the ODSP as a storage mechanism. Please note that odsp-client is currently an experimental package. We'd love for you to try it out and provide feedback but it is not yet recommended/supported for production scnearios.

## Using odsp-client

The odsp-client package has an `OdspClient`` class that allows you to interact with Fluid

```typescript
import { OdspClient } from "@fluid-experimental/odsp-client";
```

### Example usage

```typescript
import { OdspClient, OdspConnectionConfig, OdspClientProps } from "@fluid-experimental/odsp-client";

const connectionConfig: OdspConnectionConfig = {
	tokenProvider: "<YOUR_TOKEN_PROVIDER>",
	siteUrl: "<SITE_URL>",
	driveId: "<RAAS_DRIVE_ID>",
};

export const clientProps: OdspClientProps = {
	connection: connectionConfig,
};

const client = new OdspClient(clientProps);
```

### Experimental Features

`OdspClient` provides access to experimental features, as demonstrated below. These features are experimental in nature and should **NOT** be used in production applications. To learn more, see [Experimental Features](https://fluidframework.com/docs/build/experimental-features/).

```typescript
const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
	getRawConfig: (name: string): ConfigTypes => settings[name],
});

export const clientProps: OdspClientProps = {
	connection: connectionConfig,
	configProvider: configProvider({
		"Fluid.Container.ForceWriteConnection": true,
	}),
};
```

## Fluid Containers

A Container instance is a organizational unit within Fluid. Each Container instance has a connection to the defined Fluid Service and contains a collection of collaborative objects.

Containers are created and identified by unique itemIds. Management and storage of these itemIds are the responsibility of the developer.

## Defining Fluid Containers

Fluid Containers are defined by a schema. The schema includes initial properties of the Container as well as what collaborative objects can be dynamically created.

```typescript
const containerSchema = {
	initialObjects: {
		/* ... */
	},
	dynamicObjectTypes: [
		/*...*/
	],
};
const odspClient = new OdspClient(clientProps);
const { container, services } = await odspClient.createContainer(containerSchema);

const itemId = await container.attach();
```

## Using Fluid Containers

Using the `OdspClient` class the developer can create and get Fluid containers. Because Fluid needs to be connected to a server, containers need to be created and retrieved asynchronously.

```typescript
import { OdspClient } from "@fluid-experimental/odsp-client";

const odspClient = new OdspClient(props);
const { container, services } = await odspClient.getContainer("_unique-itemId_", schema);
```

## Using initial objects

The most common way to use Fluid is through initial collaborative objects that are created when the Container is created. Distributed data structures and DataObjects are both supported types of collaborative objects.

`initialObjects` are loaded into memory when the Container is loaded and the developer can access them via the Container's `initialObjects` property. The `initialObjects` property has the same signature as the Container schema.

```typescript
// Define the keys and types of the initial list of collaborative objects.
// Here, we are using a SharedMap DDS on key "map1" and a SharedString on key "text1".
const schema = {
	initialObjects: {
		map1: SharedMap,
		text1: SharedString,
	},
};

// Fetch back the container that had been created earlier with the same itemId and schema
const { container, services } = await OdspClient.getContainer("_unique-itemId_", schema);

// Get our list of initial objects that we had defined in the schema. initialObjects here will have the same signature
const initialObjects = container.initialObjects;
// Use the keys that we had set in the schema to load the individual objects
const map1 = initialObjects.map1;
const text1 = initialObjects.text1;
```
