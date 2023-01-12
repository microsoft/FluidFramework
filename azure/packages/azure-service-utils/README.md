# @fluidframework/azure-service-utils

A set of helper utilities for building backend APIs for use with Azure Fluid Relay service.

## generateToken

This function will generate a JWT token that can be sent to an `ITokenProvider` instance that is being passed into the constructor of `AzureClient`. The `tenantId` and `key` map to the values provided to you as part of the onboarding process for the Azure Fluid Relay service. The `user` objects allows you to define the properties for the current user that this token will be used to authenticate for. The values passed in here represent the values that will be supplied as part of the `audience` in the `FluidContainer` that will be provided by the `AzureClient`.

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
