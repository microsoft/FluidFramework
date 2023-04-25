# @fluidframework/app-insights-logger

## This `app-insights-logger` package provides a Fluid telemetry logger that will route Fluid telemetry to Azure App Insights using the `ApplicationInsights.trackEvent` API provided by the `@microsoft/applicationinsights-web` package. The logger is intended for use by browser based web applications, not NodeJS applications [as stated by the App Insights Web SDK.](https://learn.microsoft.com/en-us/azure/azure-monitor/app/app-insights-overview?tabs=net)

## What is Application Insights?

At a high level, App Insights is an Azure cloud service for aggregating, visualizing, analyzing, and alerting on metrics related to a given “service” or “application”.
You create an App Insights Instance and then configure your applications to send data to your instance using either Azure provided SDK’s or REST API’s.
This could be general machine related health being automatically reported to the instance when you install a logging program on your service’s machines or custom metrics that you manually configure your applications to send. Keep in mind this logger is intended for use with browser based web applications, not pure nodeJS.
In our case, we are sending custom metrics. [Learn more about Azure App Insights with their docs](https://learn.microsoft.com/en-us/azure/azure-monitor/app/app-insights-overview?tabs=net)

## Use case:

The primary use case of sending telemetry to Azure App Insights allows users to analyze and store telemetry logs without having to manually setup complex infrastructure.
Once in App Insights users can leverage Azure's log exploring tools to analyze logs.

## Usage:

In order to use this logger, users will first have to initialize an `ApplicationInsights` client from the `@microsoft/applicationinsights-web` package. In most cases, initializing the `ApplicationInsights` client will be just providing your App Insight instances connection string AND calling `.loadAppInsights()` on your client. [Learn more about the App Insights SDK](https://github.com/microsoft/ApplicationInsights-JS#before-getting-started)

Here is an example usage:

```json
	const appInsightsClient = new ApplicationInsights({
		config: {
			connectionString:
				"InstrumentationKey=abcdefgh-ijkl-mnop-qrst-uvwxyz6ffd9c;IngestionEndpoint=https://westus2-2.in.applicationinsights.azure.com/;LiveEndpoint=https://westus2.livediagnostics.monitor.azure.com/",
		},
	});

   // Initializes the App Insights client. Without this, logs will not be sent to Azure.
	appInsightsClient.loadAppInsights()

	const logger = new FluidAppInsightsLogger(appInsightsClient);

	// Example of sending an event to app insights using the FluidAppInsightsLogger directly
	logger.send({category: "mockEvent",	eventName: "mockEventName"});

	// More commonly, we would provide the logger to the instance of the Fluid client your application is using to create Fluid Containers. This enables Fluid telemetry to be automatically sent to App Insights as your Fluid App is running.
	const tinyliciousClient = new TinyliciousClient({
		logger: logger
	});

	const createContainerResult = await tinyliciousClient.createContainer(containerSchema);

```

## Viewing Logs in App Insights:

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
