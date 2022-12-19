# @fluidframework/azure-scenario-runner

Scenario runnner for FRS and Azure Local Service. This package can be used to create and execute various scenarios involving azure-client, IFluidContainer and a range of distributed data structures (DDSes), while collecting telemetry and validating state in the process. Scenarios are sourced via yaml config files.

To execute test: `npm run start`.

To execute test against Azure Fluid Relay:

1. Make a tenant config JSON string like so, to be used in place of `<frs-config>` in step 2:

```json
{ "tenantId": "<tenant-id>", "tenantKey": "<tenant-key>", "fnUrl": "<azure-function-url>" }
```

> NOTE: You can use _either_ tenantKey or fnUrl. `fnUrl` will be appended with the suffix "/api/GetFrsToken" to retrieve a token from an API.
>
> Optionally, you may also need to change the endpoint configured under testConfig.yml to match your tenant's location. 2. Execute test`fluid__scenario__runner='<frs-config>' npm start`

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
