# @fluidframework/odsp-client

The odsp-client package provides a simple and powerful way to consume collaborative Fluid data with OneDrive/SharePoint (ODSP) storage. Please note that odsp-client is currently an experimental package. We'd love for you to try it out and provide feedback but it is not yet recommended or supported for production scenarios.

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

<!-- AUTO-GENERATED-CONTENT:START (README_IMPORT_INSTRUCTIONS:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Importing from this package

This package leverages [package.json exports](https://nodejs.org/api/packages.html#exports) to separate its APIs by support level.
For more information on the related support guarantees, see [API Support Levels](https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels).

To access the `public` ([SemVer](https://semver.org/)) APIs, import via `@fluidframework/odsp-client` like normal.

To access the `beta` APIs, import via `@fluidframework/odsp-client/beta`.

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
const { container, services } = await odspClient.createContainer(containerSchema);

const itemId = await container.attach();
```

## Using Fluid Containers

Using the `OdspClient` class the developer can create and get Fluid containers. Because Fluid needs to be connected to a server, containers need to be created and retrieved asynchronously.

```typescript
import { OdspClient } from "@fluidframework/odsp-client";

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

<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_PACKAGE_README:scripts=FALSE&installation=FALSE&importInstructions=FALSE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## API Documentation

API documentation for **@fluidframework/odsp-client** is available at <https://fluidframework.com/docs/apis/odsp-client>.

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
