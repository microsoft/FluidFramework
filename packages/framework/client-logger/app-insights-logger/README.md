# @fluidframework/app-insights-logger

## Overview

This `app-insights-logger` package provides a Fluid telemetry logger that will route Fluid telemetry to Azure App Insights using the `ApplicationInsights.trackEvent` API provided by the [@microsoft/applicationinsights-web](https://www.npmjs.com/package/@microsoft/applicationinsights-web) package. The logger is intended for use by browser based web applications, not NodeJS applications [as stated by the App Insights Web SDK.](https://learn.microsoft.com/en-us/azure/azure-monitor/app/app-insights-overview?tabs=net)

## What is Application Insights?

At a high level, App Insights is an Azure cloud service for aggregating, visualizing, analyzing, and alerting on metrics related to a given “service” or “application”.
You create an App Insights Instance and then configure your applications to send data to your instance using either Azure provided SDK’s or REST APIs.
This could be general machine related health being automatically reported to the instance when you install a logging program on your service’s machines or custom metrics that you manually configure your applications to send. Keep in mind this logger is intended for use with browser based web applications, not pure nodeJS.
In our case, we are sending custom metrics. [Learn more about Azure App Insights with their docs](https://learn.microsoft.com/en-us/azure/azure-monitor/app/app-insights-overview?tabs=net)

<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_README_HEADER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Using Fluid Framework libraries

For a dependency on a Fluid Framework library's public APIs, we recommend a `^` (caret) version range.
For example, use `^1.3.4`.

For a dependency on an unstable API, such as a `beta` API, we recommend a more restrictive version range.
For example, use a `~` version range.

## Installation

Run this command to install the package:

```bash
npm i @fluidframework/app-insights-logger
```

## Importing from this package

This package uses [package.json exports](https://nodejs.org/api/packages.html#exports) to separate APIs by support level.
For information about the support guarantees, read [API Support Levels](https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels).

Import the `public` ([Semantic Versioning (SemVer)](https://semver.org/)) APIs from `@fluidframework/app-insights-logger`.

Import the `beta` APIs from `@fluidframework/app-insights-logger/beta`.

## API Documentation

Read the **@fluidframework/app-insights-logger** API documentation at <https://fluidframework.com/docs/apis/app-insights-logger>.

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

<!-- AUTO-GENERATED-CONTENT:START (README_FOOTER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Minimum Client Requirements

Fluid Framework client libraries support the platforms in this document.
These requirements are intentionally restrictive.
Within a major version series, we can relax these requirements, but we cannot make them stricter.
For a Long Term Support (LTS) version, we might need to support these platforms for several years.

Other configurations can work, but Fluid Framework does not support them.
If an unsupported configuration stops working, we do not classify this as a bug.
To request support for a configuration that is not listed, file an issue.
The product team will evaluate your request.
In the issue, specify the current status of the configuration:

-   The configuration works but needs official support.
-   The configuration does not work and requires changes.

### Supported Runtimes

-   Fluid Framework supports Node.js versions 22 and 24 while they receive [upstream support](https://nodejs.org/en/about/previous-releases).
    -   Fluid Framework will stop support for version 22 [when upstream support ends on 2027-04-30](https://github.com/nodejs/release#release-schedule).
    -   Fluid Framework does not support Node.js with the `--no-experimental-fetch` flag.
-   Fluid Framework supports modern browsers that support the ES2022 standard library.

### Supported Tools

-   [TypeScript 6.0](https://typescriptdocs.com/release-notes/TypeScript%206.0):
    -   Fluid Framework supports all [`strict`](https://www.typescriptlang.org/tsconfig) options.
    -   Set the build targets (`lib`, `target`) to `ES2022` or later.
    -   Enable [`strictNullChecks`](https://www.typescriptlang.org/tsconfig).
    -   Fluid Framework does not support [configuration options deprecated in TypeScript 6.0](https://typescriptdocs.com/release-notes/TypeScript%206.0#breaking-changes-and-deprecations-in-typescript-6-0).
    -   Fluid Framework does not fully support `exactOptionalPropertyTypes`.
        If you enable this option, do not use `in`, `Reflect.has`, `Object.hasOwn`, or `Object.prototype.hasOwnProperty` to narrow members of Fluid Framework types.
        These methods can incorrectly exclude `undefined` from the possible values.
-   [webpack](https://webpack.js.org/) 5
    -   We do not require a specific bundler.
        Other bundlers that handle ES Modules can work, but we actively test only webpack.

### Module Resolution

In TypeScript `compilerOptions`, use [`Node16`, `Node20`, `NodeNext`, or `Bundler`](https://www.typescriptlang.org/tsconfig#moduleResolution) module resolution.
These settings follow the [Node.js v12+ ESM Resolution and Loading algorithm](https://nodejs.github.io/nodejs.dev/en/api/v20/esm/#resolution-and-loading-algorithm).

Do not use `Node10` module resolution.

### Module Formats

-   ES Modules:
    Use ES Modules to consume Fluid Framework client packages, including in Node.js.
-   CommonJS:
    Fluid Framework does not officially support CommonJS in version 3.0 or later.

## Contribution Guidelines

You can [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid Framework in these ways:

-   Answer questions in [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
-   [Submit bug reports](https://github.com/microsoft/FluidFramework/issues) and help verify fixes.
-   Review [source code changes](https://github.com/microsoft/FluidFramework/pulls).
-   [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

For detailed instructions, read the [Fluid Framework wiki](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Home.md).

This project follows the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information, read the [Code of Conduct frequently asked questions](https://opensource.microsoft.com/codeofconduct/faq/).
For questions or comments, contact [opencode@microsoft.com](mailto:opencode@microsoft.com).

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

<!-- AUTO-GENERATED-CONTENT:END -->
