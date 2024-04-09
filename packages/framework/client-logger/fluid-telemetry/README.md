# Description

This package contains code enabling the production and consumption of typed telemetry for Fluid Framework applications. The typed telemetry from this package is used as the backbone for different Fluid Framework cloud offerings such as dashboards and alarms for Fluid applications. This package can also be used as a reference for customizing and creating your own telemetry solution if desired.

At this time, the package enables collection of telemetry related to the Fluid Container only. In the future, more areas would be added as needs evolve.

# Getting Started

Let's walk through some examples for getting started with Fluid telemetry for containers using the `@fluidframework/fluid-telemetry` package.

## Use Case 1: Logging container telemetry to Azure App Insights and analyzing app data

### Prerequisite

Before you can get telemetry sent to Azure App Insights, you'll need to create an Instance of App Insights on Azure. You'll then be able to leverage Azure App Insights integration and route your Fluid container application telemetry to App Insights. [Learn more about Azure App Insights](https://learn.microsoft.com/en-us/azure/azure-monitor/app/app-insights-overview). [Creating your App Insights instance](https://learn.microsoft.com/en-us/azure/azure-monitor/app/create-workspace-resource?tabs=bicep).

Once you setup your App Insights instance, you can proceed with next steps below to route the telemetry to App Insights.

### Step 1: Install new package dependencies

Install the Fluid Framework telemetry package and Azure App Insights package dependencies

-   Using NPM: `npm install @fluidframework/fluid-telemetry @microsoft/applicationinsights-web`

### Step 2: Setup telemetry collection

Now, let's start the telemetry production by initializing our telemetry collection where we initialize our containers:

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
            /////////////// Important ///////////////
            // Edit this with your app insights instance connection string which 
            // can be found on the Azure Portal where you created the
            // App Insights instance (below is an example string)
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

That's it for now! If you've decided to use Azure App Insights, we have designed useful prebuilt queries that utilize the generated telemetry. You can try out these queries after running your application with above code for a little duration.

You can find these queries [here]().
// TODO: rohandubal:Fix me

## Use Case 2: Setup a custom telemetry consumer

To use a custom telemetry consumer and integrate with a cloud provider or custom dashboard solution, you need to implement the `ITelemetryConsumer` interface.

In this example, you'll walk through the basic setup process to start getting container telemetry to be produced and log it to the console.

### Step 1: Install new package dependencies

Install the Fluid Framework telemetry package dependency

-   Using NPM: `npm install @fluidframework/fluid-telemetry`

### Step 2: Setup a custom telemetry consumer

Here we'll create our own telemetry consumer which extends the `ITelemetryConsumer` interface. Let's look at an example that will simply log the telemetry to console.

```ts
import { ITelemetryConsumer, IFluidTelemetry } from "@fluidframework/fluid-telemetry";

class MySimpleTelemetryConsumer implements ITelemetryConsumer {
	consume(event: IFluidTelemetry) {
		console.log(event);
	}
}
```

### Step 3: Setup telemetry collection

Now, let's start the telemetry production and loop in our telemetry consumer from step 2. We will be initializing our telemetry collection where we initialize our containers:

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

You can now run the app and see the telemetry being printed on your console.