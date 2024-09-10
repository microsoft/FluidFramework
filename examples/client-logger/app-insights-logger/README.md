# @fluid-example/app-insights-logger

## Overview

This package provides a simple Fluid application complete with a UI view in [React](https://react.dev/) to test the Fluid App Insights telemetry logger that will route typical Fluid telemetry to configured Azure App Insights.

## Configuring the logger to send telemetry to your app insights instance

-   within `src/components/ClientUtilities.ts`, update the function definition for `initializeTinyliciousClient` to use the AppInsightsLogger with your instances configuration. In most cases, this is simply the most basic config containing your correct connection string:

```typescript
function initializeTinyliciousClient(): TinyliciousClient {
	const appInsightsClient = new ApplicationInsights({
		config: {
			connectionString:
				// Edit this with your app insights instance connection string (this is an example string)
				"InstrumentationKey=abcdefgh-ijkl-mnop-qrst-uvwxyz6ffd9c;IngestionEndpoint=https://westus2-2.in.applicationinsights.azure.com/;LiveEndpoint=https://westus2.livediagnostics.monitor.azure.com/",
		},
	});

	appInsightsClient.loadAppInsights();

	return new TinyliciousClient({
		logger: new FluidAppInsightsLogger(appInsightsClient),
	});
}
```

<!-- AUTO-GENERATED-CONTENT:START (EXAMPLE_APP_README_HEADER:usesTinylicious=FALSE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Getting Started

You can run this example using the following steps:

1. Enable [corepack](https://nodejs.org/docs/latest-v16.x/api/corepack.html) by running `corepack enable`.
1. Run `pnpm install` and `pnpm run build:fast --nolint` from the `FluidFramework` root directory.
    - For an even faster build, you can add the package name to the build command, like this:
      `pnpm run build:fast --nolint @fluid-example/app-insights-logger`
1. Run `pnpm start` from this directory and open <http://localhost:8080> in a web browser to see the app running.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## Starting the test

-   run `pnpm run start` and navigate to http://localhost:8080/ in your web browser.

## Generating telemetry events

-   There will be telemetry events that flow automatically when you start the test app. In addition to these events, you can control creating telemetry events yourself by interacting with UI app, incremeting/decrementing the shared counter and editing the shared string provided in this example

## Viewing Telemetry Logs in App Insights

From the Azure web portal, navigate to your app insights instance. Now, go to the "Logs" for your instance, this should be an option within the left side panel. Finally, from this page, you can query for telemetry events, which will be stored in the customEvents table. As an example, you can issue this simple query to get recent telemetry events sent to the customEvents table:

-   Get a count of each distinct log event name and category of log event

    ```
    customEvents
    | summarize count() by name, tostring(customDimensions.category)
    ```

-   Get all performance related logs

    ```
    customEvents
    | where customDimensions.name == "performance"
    ```

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
