# @fluidframework/azure-service-utils

Helper utilities for use when developing BE APIs for use with applications built using the `AzureClient`

## generateToken

This function will generate a JWT token that can be sent to an `ITokenProvider` instance that is being passed into the constructor of `AzureClient`. The `tenantId` and `key` map to the values provided to you as part of the onboarding process for the Azure Fluid Relay service. The `user` objects allows you to define the properties for the current user that this token will be used to authenticate for. The values passed in here represent the values that will be supplied as part of the `audience` in the `FluidContainer` that will be provided by the `AzureClient`.
