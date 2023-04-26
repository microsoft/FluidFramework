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

## Starting the test

-   run `pnpm run start:test-app` and navigate to http://localhost:8080/ in your web browser.

## Generating telemetry events

-   There will be telemetry events that flow automatically when you start the test app. In addition to these events, you can control creating telemetry events yourself by interacting with UI app, incremeting/decrementing the shared counter and editing the shared string provided in this example
