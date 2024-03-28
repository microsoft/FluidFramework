# Description

This package contains code enabling the production and consumption of typed telemetry for Fluid Framework applications. The typed telemetry from this package is used as the backbone for different Fluid Framework cloud offerings such as dashboards and alarms for Fluid applications. People can also use this package as a reference for customizing and creating their own telemetry solution if desired.

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
import { FluidContainer } from "@fluidframework/fluid-static";
import { TelemetryManagerConfig, startTelemetryManagers, createAppInsightsTelemetryConsumer } from "@fluidframework/external-telemetry"

const myAppContainer: FluidContainer = {...your code to create a Fluid Continer}


// Create App Insights Client
const appInsightsClient = new ApplicationInsights({
	config: {
		connectionString:
			"InstrumentationKey=abcdefgh-ijkl-mnop-qrst-uvwxyz6ffd9c;IngestionEndpoint=https://westus2-2.in.applicationinsights.azure.com/;LiveEndpoint=https://westus2.livediagnostics.monitor.azure.com/",
	},
});

// Initializes the App Insights client. Without this, logs will not be sent to Azure.
appInsightsClient.loadAppInsights();

// Create the telemetry manager config object(s)
const telemetryManagerConfig: TelemetryManagerConfig = {
			container: myAppContainer,
			consumers: [createAppInsightsTelemetryConsumer(appInsightsClient)],
		};

// Setup telemetry manager(s)
startTelemetryManagers(telemetryManagerConfig);

// Done!
```

# Telemetry Events

This section details the currently available telemetry event and their typescript types.

### Container Telemetry

Telemetry events relating directly to Fluid Containers.

1. `ContainerConnectedTelemetry` - Description coming soon
1. `ContainerDisconnectedTelemetry` - Description coming soon
1. `ContainerClosedTelemetry` - Description coming soon
1. `ContainerAttachingTelemetry` - Description coming soon
1. `ContainerAttachedTelemetry` - Description coming soon

# Internal Design

This section is relevant for people looking to create their own custom logic for production and consumption of telemetry for their Fluid Framework application. It details information about the internal package setup to help people get a better understanding of how to get started customizing themselves. At this time internal types and classes are not exported for users.

The telemetry is produced from internal Fluid system events, such as [`IContainerEvents`](../../../common/container-definitions/src/loader.ts).
These events are subscribed to and when they if/when they fire, additional information is added and a strongly typed telemetry event is produced.

## High level design overview

At a high level, this package accomplishes producing and consuming telemetry with a few simple concepts

1. **Telemetry Producers** - Producers are responsible for taking in raw Fluid system events and producing the typed telemetry provided within this package.
2. **Telemetry Consumers** - Consumers are responsible for recieving typed telemetry events [`IExternalTelemetry`](./telemetry-manager/common/telemetry/index.ts) and doing something with is. Consumers extend the base interface[`ITelemetryConsumer`](./telemetry-manager/common/consumers/index.ts).
    - One concrete implementation of this is emitting the telemetry to an external logging service, for example to Azure App insights [`AppInsightsTelemetryConsumer`](./telemetry-manager/common/consumers/appInsightsTelemetryConsumer.ts)
3. **Telemetry Managers** - Managers handle taking **Producers** and **Consumers** and linking them together create a pipeline for producing [`IExternalTelemetry`](./telemetry-manager/common/telemetry/index.ts), ideally with a focus on a specific set of events.
    - The [`ContainerTelemetryManager`](./telemetry-manager/container/telemetryManager.ts) is one such example focused on producing [`IContainerTelemetry`](./telemetry-manager/container/containerTelemetry.ts).

## Package Structure

`/common/` : Shared/common files such as interfaces used within the telemetry-manager pacakge

-   `/consumers/` : Shared/common files for **telemetry consumers** such as base interfaces and implementations
    that are not specific to specific domain of Fluid events

-   `/telemetry/` : Shared/common files for typed telemetry such as base interface `IExternalTelemetry`

`/container/` : Code files for specifically managing Fluid container events

-   `/containerSystemEvents.ts` : This file contains an enum [`ContainerSystemEventName`](./telemetry-manager/container/containerSystemEvents.ts) with a non-exhaustive set of the unique event names of raw system events from [`IContainerEvents`](../../../common/container-definitions/src/loader.ts) produced by Fluid containers.
    It's important to note that the type for each system events is a actually function signature such as

    ```
    (event: "readonly", listener: (readonly: boolean) => void): void;
    ```

    but that the [`ContainerSystemEventName`](./telemetry-manager/container/containerSystemEvents.ts) enum only captures the event name in each function.

-   `/containerTelemetry.ts` : This file contains the types for container telemetry that can be produced.

-   `/telemetryManager.ts` : This class manages container telemetry intended for customers to consume. It manages subcribing to the proper raw container system events, sending them to the [`ContainerEventTelemetryProducer`](./telemetry-manager/container/telemetryProducer.ts) to be transformed into [`IContainerTelemetry`](./telemetry-manager/container/containerTelemetry.ts) and finally sending them to the provided [`ITelemetryConsumer`](./telemetry-manager/common/consumers/index.ts)

-   `/telemetryProducer.ts` : This class produces [`IContainerTelemetry`](./telemetry-manager/container/containerTelemetry.ts) from raw container system events [`IContainerEvents`](../../../common/container-definitions/src/loader.ts) The class contains different helper methods for simplifying and standardizing logic for adding additional information necessary
    to produce different [`IContainerTelemetry`](./telemetry-manager/container/containerTelemetry.ts).

`/factory/` : Helps simplify the creation of one or more telemetry managers without having to worry too much about the underlying resources and components.

---
