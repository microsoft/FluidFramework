# @fluidframework/azure-scenario-runner

## Azure Scenario Runner

This package provides a reference application that executes pre-set scenarios with the intent of measuring the Fluid Framework's performance and reliability. We primarily use this package as part of a pipeline scheduled to run periodically to measure, log, and report various performance and reliability metrics. These metrics can then be used to gauge an undrestanding of the expected behavior/performance of the Fluid Framework in these various scenarios, which can help define the SLA.

## Implemented Scenarios

### Azure Client

Tests creating an Azure Client

### Doc Creator

This scenario creates a bunch of empty Fluid documents and measures the time it takes to create theses documents.

### Doc Loader

This scenario loads a set of previously created docs multiple times and measures the time it takes to load these documents.

### Map Traffic

[TBD]

---

# Guides

## Running the perf tests locally

1. Set the `azure__fluid__relay__service__tenantId` environment variable to equal your FRS TenantID
2. Set the `azure__fluid__relay__service__tenantKey` environment variable to equal your FRS Tenant's Primary Key
3. Set the `azure__fluid__relay__service__function__url` environment variable to equal your FRS Service Function URL
4. Set the `azure__fluid__relay__service__endpoint` environment variable to equal the Alfred endpoint of your FRS tenant
5. Run the test with `npm run start`

## Configuring the test configuration

The test configuration file `testConfig_v1.yml` can be configured to modify the parameters of each scenario and the order they're run in.

## Adding New Scenarios

[TBD]

Scenario runnner for FRS and Azure Local Service. This package can be used to create and execute various scenarios involving azure-client, IFluidContainer and a range of distributed data structures (DDSes), while collecting telemetry and validating state in the process. Scenarios are sourced via yaml config files.

# Appendix

<!-- AUTO-GENERATED-CONTENT:START (README_CONTRIBUTION_GUIDELINES_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->

<!-- This section is automatically generated. To update it, make the appropriate changes to docs/md-magic.config.js or the embedded content, then run 'npm run build:md-magic' in the docs folder. -->

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

<!-- AUTO-GENERATED-CONTENT:START (README_HELP_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->

<!-- This section is automatically generated. To update it, make the appropriate changes to docs/md-magic.config.js or the embedded content, then run 'npm run build:md-magic' in the docs folder. -->

## Help

Not finding what you're looking for in this README?
Check out our [GitHub Wiki](https://github.com/microsoft/FluidFramework/wiki) or [fluidframework.com](https://fluidframework.com/docs/).

Still not finding what you're looking for? Please [file an issue](https://github.com/microsoft/FluidFramework/wiki/Submitting-Bugs-and-Feature-Requests).
Thank you!

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

<!-- AUTO-GENERATED-CONTENT:START (README_TRADEMARK_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->

<!-- This section is automatically generated. To update it, make the appropriate changes to docs/md-magic.config.js or the embedded content, then run 'npm run build:md-magic' in the docs folder. -->

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
