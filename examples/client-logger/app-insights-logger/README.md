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

<!-- markdown-magic:begin {"transform":"example-app-readme-header","usesTinylicious":false,"headingLevel":2} -->

<!-- prettier-ignore-start -->

<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Getting Started

Complete these steps to run the example:

1. Run `corepack enable` to enable [Corepack](https://nodejs.org/docs/latest-v16.x/api/corepack.html).
2. From the `FluidFramework` root directory, run `pnpm install`.
3. From the `FluidFramework` root directory, run `pnpm run build:fast --nolint`.
   * To build only this package, add the package name to the command:
     `pnpm run build:fast --nolint @fluid-example/app-insights-logger`
4. Run `pnpm start` from this directory.
5. Open <http://localhost:8080> in a web browser.

To run the example with SharePoint, complete these steps:

1. Follow the [webpack-fluid-loader instructions](https://github.com/microsoft/FluidFramework/blob/main/examples/utils/webpack-fluid-loader/README.md#sharepoint) to get authentication credentials.
2. Run `pnpm start:spo` or `pnpm start:spo-df` from this directory.
3. Open <http://localhost:8080> in a web browser.

<!-- prettier-ignore-end -->

<!-- markdown-magic:end -->

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

<!-- markdown-magic:begin {"transform":"readme-footer","headingLevel":2} -->

<!-- prettier-ignore-start -->

<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

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
