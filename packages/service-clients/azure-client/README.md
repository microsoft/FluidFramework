# @fluidframework/azure-client

The azure-client package provides a simple and powerful way to consume collaborative Fluid data with the Azure Fluid Relay service.

<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_README_HEADER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Using Fluid Framework libraries

When taking a dependency on a Fluid Framework library's public APIs, we recommend using a `^` (caret) version range, such as `^1.3.4`.
While Fluid Framework libraries may use different ranges with interdependencies between other Fluid Framework libraries,
library consumers should always prefer `^`.

If using any of Fluid Framework's unstable APIs (for example, its `beta` APIs), we recommend using a more constrained version range, such as `~`.

## Installation

To get started, install the package by running the following command:

```bash
npm i @fluidframework/azure-client
```

## Importing from this package

This package leverages [package.json exports](https://nodejs.org/api/packages.html#exports) to separate its APIs by support level.
For more information on the related support guarantees, see [API Support Levels](https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels).

To access the `public` ([SemVer](https://semver.org/)) APIs, import via `@fluidframework/azure-client` like normal.

To access the `legacy` APIs, import via `@fluidframework/azure-client/legacy`.

## API Documentation

API documentation for **@fluidframework/azure-client** is available at <https://fluidframework.com/docs/apis/azure-client>.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

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
const { container, services } = await azureClient.createContainer(schema, "2" /* compatibilityMode */);

// Set any default data on the container's `initialObjects` before attaching
// Returned ID can be used to fetch the container via `getContainer` below
const id = await container.attach();
```

## Using Fluid Containers

Using the `AzureClient` object the developer can create and get Fluid containers. Because Fluid needs to be connected to a server, containers need to be created and retrieved asynchronously.

```typescript
import { AzureClient } from "@fluidframework/azure-client";

const azureClient = new AzureClient(props);
const { container, services } = await azureClient.getContainer("_unique-id_", schema, "2" /* compatibilityMode */);
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
const { container, services } = await azureClient.getContainer("_unique-id_", schema, "2" /* compatibilityMode */);

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

const { container, services } = await azureClient.getContainer("_unique-id_", schema, "2" /* compatibilityMode */);
const map1 = container.initialObjects.map1;

const text1 = await container.create(SharedString);
map1.set("text1-unique-id", text1.handle);

// ...

const text1Handle = map1.get("text1-unique-id"); // Get the handle
const text1 = await map1.get(); // Resolve the handle to get the object

// or

const text1 = await map1.get("text1-unique-id").get();
```

<!-- AUTO-GENERATED-CONTENT:START (README_FOOTER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Minimum Client Requirements

These are the platform requirements for the current version of Fluid Framework Client Packages.
These requirements err on the side of being too strict since within a major version they can be relaxed over time, but not made stricter.
For Long Term Support (LTS) versions this can require supporting these platforms for several years.

It is likely that other configurations will work, but they are not supported: if they stop working, we do not consider that a bug.
If you would benefit from support for something not listed here, file an issue and the product team will evaluate your request.
When making such a request please include if the configuration already works (and thus the request is just that it becomes officially supported), or if changes are required to get it working.

### Supported Runtimes

-   NodeJs ^20.10.0 except that we will drop support for it [when NodeJs 20 loses its upstream support on 2026-04-30](https://github.com/nodejs/release#release-schedule), and will support a newer LTS version of NodeJS (22) at least 1 year before 20 is end-of-life. This same policy applies to NodeJS 22 when it is end of life (2027-04-30).
-   Running Fluid in a Node.js environment with the `--no-experimental-fetch` flag is no longer supported.
-   Modern browsers supporting the es2022 standard library: in response to asks we can add explicit support for using babel to polyfill to target specific standards or runtimes (meaning we can avoid/remove use of things that don't polyfill robustly, but otherwise target modern standards).

### Supported Tools

-   TypeScript 5.4:
    -   All [`strict`](https://www.typescriptlang.org/tsconfig) options are supported.
    -   [`strictNullChecks`](https://www.typescriptlang.org/tsconfig) is required.
    -   [Configuration options deprecated in 5.0](https://github.com/microsoft/TypeScript/issues/51909) are not supported.
    -   `exactOptionalPropertyTypes` is currently not fully supported.
        If used, narrowing members of Fluid Framework types types using `in`, `Reflect.has`, `Object.hasOwn` or `Object.prototype.hasOwnProperty` should be avoided as they may incorrectly exclude `undefined` from the possible values in some cases.
-   [webpack](https://webpack.js.org/) 5
    -   We are not intending to be prescriptive about what bundler to use.
        Other bundlers which can handle ES Modules should work, but webpack is the only one we actively test.

### Module Resolution

[`Node16`, `NodeNext`, or `Bundler`](https://www.typescriptlang.org/tsconfig#moduleResolution) resolution should be used with TypeScript compilerOptions to follow the [Node.js v12+ ESM Resolution and Loading algorithm](https://nodejs.github.io/nodejs.dev/en/api/v20/esm/#resolution-and-loading-algorithm).
Node10 resolution is not supported as it does not support Fluid Framework's API structuring pattern that is used to distinguish stable APIs from those that are in development.

### Module Formats

-   ES Modules:
    ES Modules are the preferred way to consume our client packages (including in NodeJs) and consuming our client packages from ES Modules is fully supported.
-   CommonJs:
    Consuming our client packages as CommonJs is supported only in NodeJS and only for the cases listed below.
    This is done to accommodate some workflows without good ES Module support.
    If you have a workflow you would like included in this list, file an issue.
    Once this list of workflows motivating CommonJS support is empty, we may drop support for CommonJS one year after notice of the change is posted here.

    -   Testing with Jest (which lacks [stable ESM support](https://jestjs.io/docs/ecmascript-modules) due to [unstable APIs in NodeJs](https://github.com/nodejs/node/issues/37648))

## Contribution Guidelines

There are many ways to [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid.

-   Participate in Q&A in our [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
-   [Submit bugs](https://github.com/microsoft/FluidFramework/issues) and help us verify fixes as they are checked in.
-   Review the [source code changes](https://github.com/microsoft/FluidFramework/pulls).
-   [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

Detailed instructions for working in the repo can be found in the [Wiki](https://github.com/microsoft/FluidFramework/wiki).

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft’s [Trademark & Brand Guidelines](https://www.microsoft.com/trademarks).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

## Help

Not finding what you're looking for in this README? Check out [fluidframework.com](https://fluidframework.com/docs/).

Still not finding what you're looking for? Please [file an issue](https://github.com/microsoft/FluidFramework/wiki/Submitting-Bugs-and-Feature-Requests).

Thank you!

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
