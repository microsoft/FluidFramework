# Description

This package contains code enabling the production and consumption of typed telemetry for Fluid Framework applications. The typed telemetry from this package is used as the backbone for different Fluid Framework cloud offerings such as dashboards and alarms for Fluid applications. This package can also be used as a reference for customizing and creating their own telemetry solution if desired.

### Telemetry Destinations

At this time, Azure App Insights is the only available destination for Fluid external telemetry. Eventually, more destinations will be added.

### What is Application Insights?

At a high level, App Insights is an Azure cloud service for aggregating, visualizing, analyzing, and alerting on metrics related to a given “service” or “application”.
You create an App Insights Instance and then configure your applications to send data to your instance using either Azure provided SDK’s or REST APIs.
This could be general machine related health being automatically reported to the instance when you install a logging program on your service’s machines or custom metrics that you manually configure your applications to send. Keep in mind this logger is intended for use with browser based web applications, not pure nodeJS.
In our case, we are sending custom metrics. [Learn more about Azure App Insights with their docs](https://learn.microsoft.com/en-us/azure/azure-monitor/app/app-insights-overview?tabs=net)

### Areas currently supported for external telemetry

1. Containers

# Getting Started

The core functionality of this package is exposed by the `createTelemetryManagers(config: TelemetryManagerConfig);` method. A Telemetry manager handles the production and consumption/emission of telemetry events and there should be one manager created per area of interest within the Fluid Framework such as Containers. In the future more areas of interest will be added.

```ts
import { ApplicationInsights } from "@microsoft/applicationinsights-web";
import { IFluidContainer } from "@fluidframework/fluid-static";
import { TelemetryConfig, startTelemetry } from "@fluidframework/external-telemetry"

let myAppContainer: IFluidContainer;
let myAppContainerId: string;
if (containerExists) {
	myAppContainerId = {...your code to get the id of the existing container}
	myAppContainer = {...your code to load a Fluid Container from myAppContainerId}
} else {
	myAppContainer = {...your code to create a new Fluid Container}
	myAppContainerId = await myAppContainer.attach();
}

// Create App Insights Client
const appInsightsClient = new ApplicationInsights({
	config: {
		connectionString:
			"InstrumentationKey=abcdefgh-ijkl-mnop-qrst-uvwxyz6ffd9c;IngestionEndpoint=https://westus2-2.in.applicationinsights.azure.com/;LiveEndpoint=https://westus2.livediagnostics.monitor.azure.com/",
	},
});

// Initializes the App Insights client. Without this, logs will not be sent to Azure.
appInsightsClient.loadAppInsights();

// This is our implementation of ITelemetryConsumer to enable sending telemetry to Azure App Insights.
class AppInsightsTelemetryConsumer implements ITelemetryConsumer {
	constructor(private readonly appInsightsClient: ApplicationInsights) {}

	consume(event: Record<string, any>) {
		this.appInsightsClient.trackEvent({
			name: event.eventName,
			properties: event,
		});
	}
}

// Create the telemetry manager config object(s)
const telemetryConfig: TelemetryConfig = {
	container: myAppContainer,
	containerId: myAppContainerId,
	consumers: [new AppInsightsTelemetryConsumer(appInsightsClient)],
};

// Start Telemetry
startTelemetry(telemetryConfig);

// Done!
```

# Telemetry Events

This section details the currently available telemetry event and their typescript types.

### Container Telemetry

Telemetry events relating directly to Fluid Containers.

1. `ContainerConnectedTelemetry`
1. `ContainerDisconnectedTelemetry`
1. `ContainerDisposedTelemetry`
