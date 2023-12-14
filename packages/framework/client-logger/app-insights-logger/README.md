# @fluidframework/app-insights-logger

## Overview

This `app-insights-logger` package provides a Fluid telemetry logger that will route Fluid telemetry to Azure App Insights using the `ApplicationInsights.trackEvent` API provided by the [@microsoft/applicationinsights-web](https://www.npmjs.com/package/@microsoft/applicationinsights-web) package. The logger is intended for use by browser based web applications, not NodeJS applications [as stated by the App Insights Web SDK.](https://learn.microsoft.com/en-us/azure/azure-monitor/app/app-insights-overview?tabs=net)

## What is Application Insights?

At a high level, App Insights is an Azure cloud service for aggregating, visualizing, analyzing, and alerting on metrics related to a given “service” or “application”.
You create an App Insights Instance and then configure your applications to send data to your instance using either Azure provided SDK’s or REST APIs.
This could be general machine related health being automatically reported to the instance when you install a logging program on your service’s machines or custom metrics that you manually configure your applications to send. Keep in mind this logger is intended for use with browser based web applications, not pure nodeJS.
In our case, we are sending custom metrics. [Learn more about Azure App Insights with their docs](https://learn.microsoft.com/en-us/azure/azure-monitor/app/app-insights-overview?tabs=net)

<!-- AUTO-GENERATED-CONTENT:START (README_INSTALLATION_SECTION:includeHeading=TRUE&devDependency=FALSE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Installation

To get started, install the package by running the following command:

```bash
npm i @fluidframework/app-insights-logger
```

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## Use case

The primary use case of sending telemetry to Azure App Insights allows users to analyze and store telemetry logs without having to manually setup complex infrastructure.
Once in App Insights users can leverage Azure's log exploring tools to analyze logs.

## Usage

In order to use this logger, users will first have to initialize an `ApplicationInsights` client from the `@microsoft/applicationinsights-web` package. In most cases, initializing the `ApplicationInsights` client will be just providing your App Insight instances connection string AND calling `.loadAppInsights()` on your client. [Learn more about the App Insights SDK](https://github.com/microsoft/ApplicationInsights-JS#before-getting-started)

Here is an example usage:

```typescript
const appInsightsClient = new ApplicationInsights({
	config: {
		connectionString:
			"InstrumentationKey=abcdefgh-ijkl-mnop-qrst-uvwxyz6ffd9c;IngestionEndpoint=https://westus2-2.in.applicationinsights.azure.com/;LiveEndpoint=https://westus2.livediagnostics.monitor.azure.com/",
	},
});

// Initializes the App Insights client. Without this, logs will not be sent to Azure.
appInsightsClient.loadAppInsights();

const logger = new createLogger(appInsightsClient);

// Example of sending an event to app insights using the FluidAppInsightsLogger directly
logger.send({ category: "mockEvent", eventName: "mockEventName" });

// More commonly, we would provide the logger to the instance of the Fluid Loader used by your application. This enables Fluid telemetry to be automatically sent to App Insights as your Fluid App is running.
const tinyliciousClient = new TinyliciousClient({
	logger,
});

const createContainerResult = await tinyliciousClient.createContainer(containerSchema);
```

## Viewing Logs in App Insights

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

<!-- AUTO-GENERATED-CONTENT:START (README_API_DOCS_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->

<!-- This section is automatically generated. To update it, make the appropriate changes to docs/md-magic.config.js or the embedded content, then run 'npm run build:md-magic' in the docs folder. -->

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

<!-- AUTO-GENERATED-CONTENT:START (README_HELP_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Help

Not finding what you're looking for in this README? Check out our [GitHub
Wiki](https://github.com/microsoft/FluidFramework/wiki) or [fluidframework.com](https://fluidframework.com/docs/).

Still not finding what you're looking for? Please [file an
issue](https://github.com/microsoft/FluidFramework/wiki/Submitting-Bugs-and-Feature-Requests).

Thank you!

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

<!-- AUTO-GENERATED-CONTENT:START (README_CONTRIBUTION_GUIDELINES_SECTION:includeHeading=TRUE) -->

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

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

<!-- AUTO-GENERATED-CONTENT:START (README_TRADEMARK_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
