# @fluidframework/tinylicious-client

The tinylicious-client package provides a simple and powerful way to consume collaborative Fluid data with the Tinylicious service.

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
npm i @fluidframework/tinylicious-client
```

## Importing from this package

This package leverages [package.json exports](https://nodejs.org/api/packages.html#exports) to separate its APIs by support level.
For more information on the related support guarantees, see [API Support Levels](https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels).

To access the `public` ([SemVer](https://semver.org/)) APIs, import via `@fluidframework/tinylicious-client` like normal.

To access the `beta` APIs, import via `@fluidframework/tinylicious-client/beta`.

## API Documentation

API documentation for **@fluidframework/tinylicious-client** is available at <https://fluidframework.com/docs/apis/tinylicious-client>.

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
    -   Running Fluid in a Node.js environment with the `--no-experimental-fetch` flag is not supported.
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
