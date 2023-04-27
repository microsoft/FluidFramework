# @fluid-example/app-insights-logger

## Overview

This package provides a simple Fluid application complete with a UI view in [React](https://react.dev/) to test the Fluid App Insights telemetry logger that will route typical Fluid telemetry to configured Azure App Insights.

<!-- AUTO-GENERATED-CONTENT:START (README_INSTALLATION_SECTION:includeHeading=TRUE&devDependency=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Installation

To get started, install the package by running the following command:

```bash
npm i @fluid-example/app-insights-logger -D
```

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

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

## Starting the test

-   run `pnpm run start:test-app` and navigate to http://localhost:8080/ in your web browser.

## Generating telemetry events

-   There will be telemetry events that flow automatically when you start the test app. In addition to these events, you can control creating telemetry events yourself by interacting with UI app, incremeting/decrementing the shared counter and editing the shared string provided in this example

<!-- AUTO-GENERATED-CONTENT:START (README_TRADEMARK_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand
Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
