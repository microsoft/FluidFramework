# Description

This package contains code enabling the production and consumption of typed telemetry for Fluid Framework applications. The typed telemetry from this package is used as the backbone for different Fluid Framework cloud offerings such as dashboards and alarms for Fluid applications. This package can also be used as a reference for customizing and creating your own telemetry solution if desired.

At this time, the package enables collection of Fluid Container related telemetry. In the future more areas may be added as needed by customers.

# Getting Started

Let's walk through some simple examples for getting started with Fluid telemetry for containers using the @fluidframework/fluid-telemetry package, we'll have to write some code.

## Example 1: Logging container telemetry to Azure App Insights

Before you can get telemetry sent to Azure App Insights, you'll need to create an Instance of App Insights on Azure. Then you'll be able to create an Azure App Insights client that you can easily turn into a ITelemetryConsumer and finally hook it up to container telemetry. [Learn more about Azure App Insights](https://learn.microsoft.com/en-us/azure/azure-monitor/app/app-insights-overview)

### Step 1: Install the @fluidframework/fluid-telemetry package and Azure App Insights package dependencies

-   Using NPM: `npm install @fluidframework/fluid-telemetry @microsoft/applicationinsights-web`

#### Step 2: Now, let's start the telemetry production by initializing our telemetry collection where we initialize our containers:

```ts
import { ApplicationInsights } from "@microsoft/applicationinsights-web";
import { IFluidContainer } from "@fluidframework/fluid-static";
import { ITelemetryConsumer , TelemetryConfig, startTelemetry, IFluidTelemetry } from "@fluidframework/fluid-telemetry"
import { AppInsightsTelemetryConsumer } from "@fluidframework/fluid-telemetry"

// 1: This is supposed to be your code for creating/loading a Fluid Container
let myAppContainer: IFluidContainer;
let myAppContainerId: string;
if (containerExists) {
    myAppContainerId = {...your code to get the id of the existing container}
    myAppContainer = {...your code to load a Fluid Container from myAppContainerId}
} else {
    myAppContainer = {...your code to create a new Fluid Container}
    myAppContainerId = await myAppContainer.attach();
}

// 2a: Instantiate our Azure App Insights Client
const appInsightsClient = new ApplicationInsights({
    config: {
        connectionString:
            // Edit this with your app insights instance connection string (this is an example string)
            "InstrumentationKey=abcdefgh-ijkl-mnop-qrst-uvwxyz6ffd9c;IngestionEndpoint=https://westus2-2.in.applicationinsights.azure.com/;LiveEndpoint=https://westus2.livediagnostics.monitor.azure.com/",
    },
});

// 2b: Initializes the App Insights client. Without this, logs will not be sent to Azure.
appInsightsClient.loadAppInsights();

// 3: Next, we'll create the telemetry config object.
// Note that we have to obtain the containerId before we can do this.
const telemetryConfig: TelemetryConfig = {
    container: myAppContainer,
    containerId: myAppContainerId,
    // We import AppInsightsTelemetryConsumer from the fluid-telemetry package
    consumers: [new AppInsightsTelemetryConsumer(appInsightsClient)],
};

// 4. Start Telemetry
startTelemetry(telemetryConfig);

// Done! Your container telemetry is now being created and sent to your Telemetry Consumer which will forward it to Azure App Insights.
```

Congrats, that's it for now! If you've decided to use Azure App Insights, we have designed useful prebuilt queries for you that utilize the generated telemetry

## Example 2: Extending ITelemetryConsumer to send Fluid telemetry to a custom destination

In this example, you'll walk through the basic setup process to start getting container telemetry to be produced and logging it to the console.

### Step 1: Install the @fluidframework/fluid-telemetry package dependency

-   Using NPM: `npm install @fluidframework/fluid-telemetry`

### Step 2: First, we'll have to create our own telemetry consumer which extends the ITelemetryConsumer interface. Let's look at an example that will simply console.log the telemetry.

```ts
import { ITelemetryConsumer, IFluidTelemetry } from "@fluidframework/fluid-telemetry";

class MySimpleTelemetryConsumer implements ITelemetryConsumer {
	consume(event: IFluidTelemetry) {
		console.log(event);
	}
}
```

### Step 3: Now, let's start the telemetry production and hook in our telemetry consumer from step 2. We will be initializing our telemetry collection where we initialize our containers:

```ts
import { IFluidContainer } from "@fluidframework/fluid-static";
import { ITelemetryConsumer , TelemetryConfig, startTelemetry, IFluidTelemetry } from "@fluidframework/external-telemetry"
// 1: import our implementation of MySimpleTelemetryConsumer from step 1
import { MySimpleTelemetryConsumer } from "./mySimpleTelmetryConsumer"

// 2: This is supposed to be your code for creating/loading a Fluid Container
let myAppContainer: IFluidContainer;
let myAppContainerId: string;
if (containerExists) {
    myAppContainerId = {...your code to get the id of the existing container}
    myAppContainer = {...your code to load a Fluid Container from myAppContainerId}
} else {
    myAppContainer = {...your code to create a new Fluid Container}
    myAppContainerId = await myAppContainer.attach();
}

// 3. Next, we'll create the telemetry config object.
// Note that we have to obtain the containerId before we can do this.
const telemetryConfig: TelemetryConfig = {
    container: myAppContainer,
    containerId: myAppContainerId,
    consumers: [new MySimpleTelemetryConsumer(appInsightsClient)],
};

// 4. Start Telemetry
startTelemetry(telemetryConfig);

// Done! Your container telemetry is now being created and sent to your Telemetry Consumer
```
