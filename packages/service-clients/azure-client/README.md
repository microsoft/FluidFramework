# @fluidframework/azure-client

The azure-client package provides a simple and powerful way to consume collaborative Fluid data with the Azure Fluid Relay service.

<!-- markdown-magic:begin {"transform":"library-readme-header","headingLevel":2} -->

<!-- prettier-ignore-start -->

<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Using Fluid Framework libraries

For a dependency on a Fluid Framework library's public APIs, we recommend a `^` (caret) version range.
For example, use `^1.3.4`.

For a dependency on an unstable API, such as a `beta` API, we recommend a more restrictive version range.
For example, use a `~` version range.

## Installation

Run this command to install the package:

```bash
npm i @fluidframework/azure-client
```

## Importing from this package

This package uses [package.json exports](https://nodejs.org/api/packages.html#exports) to separate APIs by support level.
For information about the support guarantees, read [API Support Levels](https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels).

Import the `public` APIs from `@fluidframework/azure-client`.

Import the `legacy` APIs from `@fluidframework/azure-client/legacy`.

## API Documentation

Read the **@fluidframework/azure-client** API documentation at <https://fluidframework.com/docs/apis/azure-client>.

<!-- prettier-ignore-end -->

<!-- markdown-magic:end -->

## Using azure-client

The azure-client package has a `AzureClient` class that allows you to interact with Fluid.

```typescript
import { AzureClient } from "@fluidframework/azure-client";
```

## Instantiating AzureClient

Fluid requires a backing service to enable collaborative communication. The `AzureClient` supports both instantiating against a deployed Azure Fluid Relay service instance for production scenarios, as well as against a local, in-memory service instance from the `@fluidframework/azure-local-service` library, for development purposes.

NOTE: You can use one instance of the `AzureClient` to create/fetch multiple containers from the same Azure Fluid Relay service instance.

In the example below we will walk through both connecting to a a live Azure Fluid Relay service instance by providing the tenant ID and key that is uniquely generated for us when onboarding to the service, as well as an example of running our application against the local service. We make use of `AzureFunctionTokenProvider` for token generation while running against a live Azure Fluid Relay instance and `InsecureTokenProvider`, from the `@fluidframework/test-client-utils` package, to authenticate a given user for access to the service locally. The `AzureFunctionTokenProvider` is an implementation that fulfills the `ITokenProvider` interface without exposing the tenant key secret in client-side code.

### Backed Locally

To run the local Azure Fluid Relay service with the default values of `localhost:7070`, enter the following command into a terminal window:

```sh
npx @fluidframework/azure-local-service@latest
```

Now, with our local service running in the background, we need to connect the application to it. For this, we first need to create our `ITokenProvider` instance to authenticate the current user to the service. For this, we can use the `InsecureTokenProvider` where we can pass anything into the key (since we are running locally) and an object identifying the current user. Our endpoint URL will point to the domain and port that our local Azure Fluid Relay service instance is running at. Lastly, to differentiate local mode from remote mode, we set the `type` to `"local"` or `"remote"` respectively.

```typescript
import { AzureClient, AzureConnectionConfig } from "@fluidframework/azure-client";
import { InsecureTokenProvider } from "@fluidframework/test-client-utils";

const clientProps = {
	connection: {
		type: "local",
		tokenProvider: new InsecureTokenProvider("fooBar", { id: "123", name: "Test User" }),
		endpoint: "http://localhost:7070",
	},
};
const azureClient = new AzureClient(clientProps);
```

### Backed by a Live Azure Fluid Relay Instance

When running against a live Azure Fluid Relay instance, we can use the same interface as we do locally but instead using the tenant ID, orderer, and storage URLs that were provided as part of the Azure Fluid Relay onboarding process. To ensure that the secret doesn't get exposed, it is passed to a secure, backend Azure function from which the token is fetched. We pass the Azure Function URL appended by `/api/GetAzureToken` along with the current user object to `AzureFunctionTokenProvider`. Later on, in `AzureFunctionTokenProvider` we make an axios `GET` request call to the Azure function by passing in the tenantID, documentId and id/name as optional parameters. Azure function is responsible for mapping between the tenant ID to a tenant key secret to generate and sign the token such that the service will accept it.

```typescript
import { AzureClient, AzureConnectionConfig } from "@fluidframework/azure-client";

const clientProps = {
	connection: {
		type: "remote",
		tenantId: "YOUR-TENANT-ID-HERE",
		tokenProvider: new AzureFunctionTokenProvider("AZURE-FUNCTION-URL" + "/api/GetAzureToken", {
			id: "test-user",
			name: "Test User",
		}),
		endpoint: "ENTER-SERVICE-DISCOVERY-URL-HERE",
	},
};
const azureClient = new AzureClient(clientProps);
```

### Experimental Features

`AzureClient` supports the ability to instantiate with experimental features enabled.
These features are experimental in nature and should **NOT** be used in production applications.
To learn more, see [Experimental Features](https://fluidframework.com/docs/build/experimental-features/).

## Fluid Containers

A Container instance is a organizational unit within Fluid. Each Container instance has a connection to the defined Fluid Service and contains a collection of collaborative objects.

Containers are created and identified by unique IDs. Management and storage of these IDs are the responsibility of the developer.

## Defining Fluid Containers

Fluid Containers are defined by a schema. The schema includes initial properties of the Container as well as what collaborative objects can be dynamically created.

See [`ContainerSchema`](./src/types.ts) in [`./src/types/ts`](./src/types.ts) for details about the specific properties.

```typescript
const schema = {
	initialObjects: {
		/* ... */
	},
	dynamicObjectTypes: [
		/*...*/
	],
};
const azureClient = new AzureClient(props);
const { container, services } = await azureClient.createContainer(schema, "2.100.0" /* oldestSupportedClient */);

// Set any default data on the container's `initialObjects` before attaching
// Returned ID can be used to fetch the container via `getContainer` below
const id = await container.attach();
```

## Using Fluid Containers

Using the `AzureClient` object the developer can create and get Fluid containers. Because Fluid needs to be connected to a server, containers need to be created and retrieved asynchronously.

```typescript
import { AzureClient } from "@fluidframework/azure-client";

const azureClient = new AzureClient(props);
const { container, services } = await azureClient.getContainer("_unique-id_", schema, "2.100.0" /* oldestSupportedClient */);
```

**Note:** When using the `AzureClient` with `tenantId` set to `"local"`, all containers that have been created will be deleted when the instance of the local Azure Fluid Relay service (not client) that was run from the terminal window is closed. However, any containers created when running against a remote Azure Fluid Relay service will be persisted. Container IDs **cannot** be reused between local and remote Azure Fluid Relay services to fetch back the same container.

## Using initial objects

The most common way to use Fluid is through initial collaborative objects that are created when the Container is created.DistributedDataStructures and DataObjects are both supported types of collaborative objects.

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

// Fetch back the container that had been created earlier with the same ID and schema
const { container, services } = await azureClient.getContainer("_unique-id_", schema, "2.100.0" /* oldestSupportedClient */);

// Get our list of initial objects that we had defined in the schema. initialObjects here will have the same signature
const initialObjects = container.initialObjects;
// Use the keys that we had set in the schema to load the individual objects
const map1 = initialObjects.map1;
const text1 = initialObjects["text1"];
```

## Using dynamic objects

LoadableObjects can also be created dynamically during runtime. Dynamic object types need to be defined in the `dynamicObjectTypes` property of the ContainerSchema.

The Container has a `create` method that will create a new instance of the provided type. This instance will be local to the user until attached to another LoadableObject. Dynamic objects created this way should be stored in initialObjects, which are attached when the Container is created. When storing a LoadableObject you must store a reference to the object and not the object itself. To do this use the `handle` property on the LoadableObject.

Dynamic objects are loaded on-demand to optimize for data virtualization. To get the LoadableObject, first get the stored handle then resolve that handle.

```typescript
const schema = {
	initialObjects: {
		map1: SharedMap,
	},
	dynamicObjectTypes: [SharedString],
};

const { container, services } = await azureClient.getContainer("_unique-id_", schema, "2.100.0" /* oldestSupportedClient */);
const map1 = container.initialObjects.map1;

const text1 = await container.create(SharedString);
map1.set("text1-unique-id", text1.handle);

// ...

const text1Handle = map1.get("text1-unique-id"); // Get the handle
const text1 = await map1.get(); // Resolve the handle to get the object

// or

const text1 = await map1.get("text1-unique-id").get();
```

<!-- markdown-magic:begin {"transform":"readme-footer","headingLevel":2} -->

<!-- prettier-ignore-start -->

<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Minimum Client Requirements

Fluid Framework client libraries support the platforms in this document.
These requirements are intentionally restrictive.
Within a major version series, we can relax these requirements, but we cannot make them stricter.
For a Long Term Support (LTS) version, we might need to support these platforms for several years.

Other configurations can work, but Fluid Framework does not support them.
If an unsupported configuration stops working, we do not classify this as a bug.
To request support for a configuration that is not listed, file an issue.
The product team will evaluate your request.
In the issue, specify the current status of the configuration:

* The configuration works but needs official support.
* The configuration does not work and requires changes.

### Supported Runtimes

* Fluid Framework supports Node.js versions 22 and 24 while they receive [upstream support](https://nodejs.org/en/about/previous-releases).
  * Fluid Framework will stop support for version 22 [when upstream support ends on 2027-04-30](https://github.com/nodejs/release#release-schedule).
  * Fluid Framework does not support Node.js with the `--no-experimental-fetch` flag.
* Fluid Framework supports modern browsers that support the ES2022 standard library.

### Supported Tools

* [TypeScript 6.0](https://typescriptdocs.com/release-notes/TypeScript%206.0):
  * Fluid Framework supports all [`strict`](https://www.typescriptlang.org/tsconfig) options.
  * Set the build targets (`lib`, `target`) to `ES2022` or later.
  * Enable [`strictNullChecks`](https://www.typescriptlang.org/tsconfig).
  * Fluid Framework does not support [configuration options deprecated in TypeScript 6.0](https://typescriptdocs.com/release-notes/TypeScript%206.0#breaking-changes-and-deprecations-in-typescript-6-0).
  * Fluid Framework does not fully support `exactOptionalPropertyTypes`.
    If you enable this option, do not use `in`, `Reflect.has`, `Object.hasOwn`, or `Object.prototype.hasOwnProperty` to narrow members of Fluid Framework types.
    These methods can incorrectly exclude `undefined` from the possible values.
* [webpack](https://webpack.js.org/) 5
  * We do not require a specific bundler.
    Other bundlers that handle ES Modules can work, but we actively test only webpack.

### Module Resolution

In TypeScript `compilerOptions`, use [`Node16`, `Node20`, `NodeNext`, or `Bundler`](https://www.typescriptlang.org/tsconfig#moduleResolution) module resolution.
These settings follow the [Node.js v12+ ESM Resolution and Loading algorithm](https://nodejs.github.io/nodejs.dev/en/api/v20/esm/#resolution-and-loading-algorithm).

Do not use `Node10` module resolution.

### Module Formats

* ES Modules:
  Use ES Modules to consume Fluid Framework client packages, including in Node.js.
* CommonJS:
  Fluid Framework does not officially support CommonJS in version 3.0 or later.

## Contribution Guidelines

You can [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid Framework in these ways:

* Answer questions in [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
* [Submit bug reports](https://github.com/microsoft/FluidFramework/issues) and help verify fixes.
* Review [source code changes](https://github.com/microsoft/FluidFramework/pulls).
* [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

For detailed instructions, read the [repo documentation](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Home.md).

This project follows the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information, read the [Code of Conduct frequently asked questions](https://opensource.microsoft.com/codeofconduct/faq/).
For questions or comments, contact <opencode@microsoft.com>.

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft’s [Trademark & Brand Guidelines](https://www.microsoft.com/trademarks).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

## Help

Read the [Fluid Framework documentation](https://fluidframework.com/docs/) for information about Fluid Framework concepts and APIs.

To request information that the documentation does not contain, [create an issue](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Contributing/Submitting-Bugs-and-Feature-Requests.md).

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- markdown-magic:end -->
