# @fluidframework/odsp-client

The odsp-client package provides a simple and powerful way to consume collaborative Fluid data with OneDrive/SharePoint (ODSP) storage. Please note that odsp-client is currently an experimental package. We'd love for you to try it out and provide feedback but it is not yet recommended or supported for production scenarios.

<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_README_HEADER) -->

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
npm i @fluidframework/odsp-client
```

## Importing from this package

This package uses [package.json exports](https://nodejs.org/api/packages.html#exports) to separate APIs by support level.
For information about the support guarantees, read [API Support Levels](https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels).

Import the `public` ([Semantic Versioning (SemVer)](https://semver.org/)) APIs from `@fluidframework/odsp-client`.

Import the `beta` APIs from `@fluidframework/odsp-client/beta`.

## API Documentation

Read the **@fluidframework/odsp-client** API documentation at <https://fluidframework.com/docs/apis/odsp-client>.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## Using odsp-client

The odsp-client package has an `OdspClient` class that allows you to interact with Fluid.

```typescript
import { OdspClient } from "@fluidframework/odsp-client";
```

### Example usage

```typescript
import { OdspClient, OdspConnectionConfig, OdspClientProps } from "@fluidframework/odsp-client";

const connectionConfig: OdspConnectionConfig = {
	tokenProvider: "<YOUR_TOKEN_PROVIDER>",
	siteUrl: "<SITE_URL>",
	driveId: "<SHAREPOINT_EMBEDDED_CONTAINER_ID>",
	filePath: "<FLUID_FILE_PATH>",
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
const { container, services } = await odspClient.createContainer(containerSchema, "2.100.0");

const itemId = await container.attach();
```

## Using Fluid Containers

Using the `OdspClient` class the developer can create and get Fluid containers. Because Fluid needs to be connected to a server, containers need to be created and retrieved asynchronously.

```typescript
import { OdspClient } from "@fluidframework/odsp-client";

const odspClient = new OdspClient(props);
const { container, services } = await odspClient.getContainer("_unique-itemId_", schema, "2.100.0");
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
const { container, services } = await OdspClient.getContainer("_unique-itemId_", schema, "2.100.0");

// Get our list of initial objects that we had defined in the schema. initialObjects here will have the same signature
const initialObjects = container.initialObjects;
// Use the keys that we had set in the schema to load the individual objects
const map1 = initialObjects.map1;
const text1 = initialObjects.text1;
```

<!-- AUTO-GENERATED-CONTENT:START (README_FOOTER) -->

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

-   The configuration works but needs official support.
-   The configuration does not work and requires changes.

### Supported Runtimes

-   Fluid Framework supports Node.js versions 22 and 24 while they receive [upstream support](https://nodejs.org/en/about/previous-releases).
    -   Fluid Framework will stop support for version 22 [when upstream support ends on 2027-04-30](https://github.com/nodejs/release#release-schedule).
    -   Fluid Framework does not support Node.js with the `--no-experimental-fetch` flag.
-   Fluid Framework supports modern browsers that support the ES2022 standard library.

### Supported Tools

-   [TypeScript 6.0](https://typescriptdocs.com/release-notes/TypeScript%206.0):
    -   Fluid Framework supports all [`strict`](https://www.typescriptlang.org/tsconfig) options.
    -   Set the build targets (`lib`, `target`) to `ES2022` or later.
    -   Enable [`strictNullChecks`](https://www.typescriptlang.org/tsconfig).
    -   Fluid Framework does not support [configuration options deprecated in TypeScript 6.0](https://typescriptdocs.com/release-notes/TypeScript%206.0#breaking-changes-and-deprecations-in-typescript-6-0).
    -   Fluid Framework does not fully support `exactOptionalPropertyTypes`.
        If you enable this option, do not use `in`, `Reflect.has`, `Object.hasOwn`, or `Object.prototype.hasOwnProperty` to narrow members of Fluid Framework types.
        These methods can incorrectly exclude `undefined` from the possible values.
-   [webpack](https://webpack.js.org/) 5
    -   We do not require a specific bundler.
        Other bundlers that handle ES Modules can work, but we actively test only webpack.

### Module Resolution

In TypeScript `compilerOptions`, use [`Node16`, `Node20`, `NodeNext`, or `Bundler`](https://www.typescriptlang.org/tsconfig#moduleResolution) module resolution.
These settings follow the [Node.js v12+ ESM Resolution and Loading algorithm](https://nodejs.github.io/nodejs.dev/en/api/v20/esm/#resolution-and-loading-algorithm).

Do not use `Node10` module resolution.

### Module Formats

-   ES Modules:
    Use ES Modules to consume Fluid Framework client packages, including in Node.js.
-   CommonJS:
    Fluid Framework does not officially support CommonJS in version 3.0 or later.

## Contribution Guidelines

You can [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid Framework in these ways:

-   Answer questions in [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
-   [Submit bug reports](https://github.com/microsoft/FluidFramework/issues) and help verify fixes.
-   Review [source code changes](https://github.com/microsoft/FluidFramework/pulls).
-   [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

For detailed instructions, read the [Fluid Framework wiki](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Home.md).

This project follows the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information, read the [Code of Conduct frequently asked questions](https://opensource.microsoft.com/codeofconduct/faq/).
For questions or comments, contact [opencode@microsoft.com](mailto:opencode@microsoft.com).

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

<!-- AUTO-GENERATED-CONTENT:END -->
