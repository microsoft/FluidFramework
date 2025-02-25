# @fluid-example/app-integration-external-controller

**_This demo is a work-in-progress_**

**Dice Roller** is a basic example that has a die and a button. Clicking the button re-rolls the die and persists
the value in the root SharedDirectory. The Fluid Container is defined in container/, the data object is defined in dataObject/.

This implementation demonstrates plugging that Container into a standalone application, rather than using the
`webpack-fluid-loader` environment that most of our packages use. This implementation relies on
[Tinylicious](/server/routerlicious/packages/tinylicious), so there are a few extra steps to get started. We bring our own view that we will
bind to the data in the container.

It also demonstrates use of Presence features to share each clients' local activity.

<!-- AUTO-GENERATED-CONTENT:START (EXAMPLE_APP_README_HEADER:usesTinylicious=FALSE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Getting Started

You can run this example using the following steps:

1. Enable [corepack](https://nodejs.org/docs/latest-v16.x/api/corepack.html) by running `corepack enable`.
1. Run `pnpm install` and `pnpm run build:fast --nolint` from the `FluidFramework` root directory.
    - For an even faster build, you can add the package name to the build command, like this:
      `pnpm run build:fast --nolint @fluid-example/app-integration-external-controller`
1. Run `pnpm start` from this directory and open <http://localhost:8080> in a web browser to see the app running.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

This example runs against the `tinylicious` service by default, but you can also run it against the `azure` service.
To run against `azure`, run `npm run start:azure`.

Note: this option requires additional steps outlined [below](#backed-locally-and-running-with-live-azure-fluid-relay-service-instance).

### Devtools

This example is configured to opt into our [developer tools suite](https://github.com/microsoft/FluidFramework/tree/main/packages/tools/devtools/devtools).
To view the Devtools view, first install our [Devtools browser extension](https://github.com/microsoft/FluidFramework/tree/main/packages/tools/devtools/devtools-browser-extension).
After launching the application, press `F12` to launch the browser's devtools panel and navigate to the `Fluid Framework Devtools` tab.

## Testing

```bash
    npm run test:jest
```

For in browser testing update `./jest-puppeteer.config.js` to:

```javascript
  launch: {
    dumpio: true, // output browser console to cmd line
    slowMo: 500,
    headless: false,
  },
```

## Data model

Dice Roller uses the following distributed data structures:

-   SharedDirectory - root

## Backed Locally and running with live Azure Fluid Relay service instance

We can connect to a live Azure Fluid Relay instance by passing in the tenant ID and discovery endpoint URL, or we can connect to a local Tinylicious server for development purposes by setting the `type` as `"local"`.

To run the the `AzureClient` against our local Tinylicious instance, we set the `type` as `"local"` and make use of
`InsecureTokenProvider`. For the latter, we pass in two values to its constructor: a key string, which can be anything
since we are running it locally, and an object identifying the current user. For running the instance locally,
the endpoint URL would point to the Tinylicious instance on the default values of `http://localhost:7070`.

To launch the local Tinylicious service instance, run `npm run start:tinylicious` from your terminal window.

When using a live Azure Fluid Relay instance, we need to provide the tenant ID, tenant secret and service discovery endpoint URL for our Azure Fluid Relay instance.

We can use the `InsecureTokenProvider` or a custom token provider similar to `AzureFunctionTokenProvider` to authorize requests to the live Azure Fluid Relay Instance.

**Note for Fluid developers:** You can use [this tool](../../../tools/getkeys) to retrieve test tenant details. After running getkeys, the env variable `fluid__test__driver__frs` will contain the tenant details.

We can run the `AzureClient` with the `InsecureTokenProvider` with code like this:

```typescript
const connectionConfig: AzureConnectionConfig = useAzure
	? {
			type: "remote",
			tenantId: "YOUR-TENANT-ID-HERE",
			tokenProvider: new InsecureTokenProvider("YOUR-SECRET-HERE", user),
			endpoint: "ENTER-DISCOVERY-ENDPOINT-URL-HERE",
	  }
	: {
			type: "local",
			tokenProvider: new InsecureTokenProvider("fooBar", user),
			endpoint: "http://localhost:7070",
	  };
```

We use the `AzureFunctionTokenProvider` which takes in the Azure function URL and an object identifying the current user, thereby
making an axios `GET` request call to the Azure Function. This axios call takes in the tenant ID, documentId and
id/name as optional parameters. The Azure Function is responsible for mapping the tenantId to tenant key secret
to generate and sign the token such that the service will accept it.

```typescript
const connectionConfig: AzureConnectionConfig = useAzure
	? {
			type: "remote",
			tenantId: "YOUR-TENANT-ID-HERE",
			tokenProvider: new AzureFunctionTokenProvider(
				"AZURE-FUNCTION-URL" + "/api/GetAzureToken",
				{ id: "test-user", name: "Test User" },
			),
			endpoint: "ENTER-DISCOVERY-ENDPOINT-URL-HERE",
	  }
	: {
			type: "local",
			tokenProvider: new InsecureTokenProvider("fooBar", user),
			endpoint: "http://localhost:7070",
	  };
```

In this way, we can toggle between remote and local mode using the same config format. We make use of
`AzureFunctionTokenProvider` for running against live Azure Fluid Relay instance since it is more secured, without exposing the tenant
secret key in the client-side code whereas while running the service locally for development purpose, we make use of `InsecureTokenProvider`.

<!-- AUTO-GENERATED-CONTENT:START (README_FOOTER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

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
