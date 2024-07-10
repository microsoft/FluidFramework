# @fluid-experimental/azure-scenario-runner

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

This scenario loads a previously created document and generates traffic on that document by setting key-values in a `SharedMap` from multiple clients.

### Nested Map

This scenario creates/loads a document and attempts to add many nested `SharedMap`s. Various configs control whether the nested maps are created before or after `container.attach()`, how many maps to create, and how long to wait between creating each map.

---

# Guides

## Running the perf tests locally

1. Set the `azure__fluid__relay__service__tenantId` environment variable to equal your FRS TenantID
2. Set the `azure__fluid__relay__service__tenantKey` environment variable to equal your FRS Tenant's Primary Key
3. Set the `azure__fluid__relay__service__function__url` environment variable to equal your FRS Service Function URL
4. Set the `azure__fluid__relay__service__endpoint` environment variable to equal the Alfred endpoint of your FRS tenant
5. (Optional) Set the `azure__fluid__relay__service__region` environment variable to equal the region of your FRS tenant (eg. `westus2`, `westus3`, `eastus`, `westeurope`)
6. Run the test with `npm run start`

## Configuring the test configuration

The test configuration file `testConfig_v1.yml` can be configured to modify the parameters of each scenario and the order they're run in.

## Adding New Scenarios

[TBD]

Scenario runnner for FRS and Azure Local Service. This package can be used to create and execute various scenarios involving azure-client, IFluidContainer and a range of distributed data structures (DDSes), while collecting telemetry and validating state in the process. Scenarios are sourced via yaml config files.

You can add new scenarios by following existing patterns (see `MapTrafficRunner` or `DocLoaderRunner` for examples) and adding additional test configs to the `configs` directory. Then, run your scenario with the command: `npm run start:scenario ./configs/<config-name>.yml`.

# Appendix

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

<!-- AUTO-GENERATED-CONTENT:START (README_HELP_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Help

Not finding what you're looking for in this README? Check out [fluidframework.com](https://fluidframework.com/docs/).

Still not finding what you're looking for? Please [file an issue](https://github.com/microsoft/FluidFramework/wiki/Submitting-Bugs-and-Feature-Requests).

Thank you!

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
