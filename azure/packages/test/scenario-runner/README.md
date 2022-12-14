# Azure Scenario Runner

    @fluidframework/azure-scenario-runner

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

## Contribution Guidelines

Please refer to our [Github Wiki](https://github.com/microsoft/FluidFramework/wiki/Contributing) for an overview of our contribution guidelines.

<!-- AUTO-GENERATED-CONTENT:END -->

<!-- AUTO-GENERATED-CONTENT:START (README_HELP_SECTION:includeHeading=TRUE) -->

## Help

Not finding what you're looking for in this README?
Check out our [GitHub Wiki](https://github.com/microsoft/FluidFramework/wiki) or [fluidframework.com](https://fluidframework.com/docs/).

Still not finding what you're looking for? Please [file an issue](https://github.com/microsoft/FluidFramework/wiki/Submitting-Bugs-and-Feature-Requests).
Thank you!

<!-- AUTO-GENERATED-CONTENT:END -->

<!-- AUTO-GENERATED-CONTENT:START (README_TRADEMARK_SECTION:includeHeading=TRUE) -->

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- AUTO-GENERATED-CONTENT:END -->
