# @fluidframework/test-client-utils

Utilities to use while developing and testing using the service-specific clients (i.e. `AzureClient`, `TinyliciousClient`) supplied by the FluidFramework.

## InsecureTokenProvider

The `InsecureTokenProvider` provides a class for locally generating JWT tokens, signed using a tenant key, that can be sent to Fluid services. These tokens will be used to authenticate and identify which user is sending operations from the client.

It takes in two parameters:
- `tenantKey` - Used for signing the token for use with the `tenantId` that we are attempting to connect to on the service
- `user` - Used to populate the current user's details in the audience currently editing the container

The `AzureClient`, from the `@fluidframework/azure-client` package, takes in a `tokenProvider` parameter as part of its constructor. This parameter can be fulfilled by using the `InsecureTokenProvider` that is exported here. However, it is advised to only use this for development or testing purposes as it risks exposing your Azure Fluid Relay service tenant key secret on your client side code.

### Usage for Development with Local Tinylicious Instance

When using the `AzureClient`, you can configure it to run against a local Tinylicous instance. Please see the client's [documentation on local development](https://github.com/microsoft/FluidFramework/blob/main/packages/framework/azure-client/README.md#backed-locally) for more information on how to do so. In this scenario, the `InsecureTokenProvider` will take any value for its `tenantKey` parameter since we're working with a local Tinylicious instance that doesn't require any authentication. As such, we can create an instance of it like this:

```javascript
const tokenProvider = new InsecureTokenProvider("fooBar", { id: "123", name: "Test User" });
```

### Usage for Development with Azure Fluid Relay service

The `AzureClient` can also be configured to a deployed Azure Fluid Relay service instance as described [here](https://github.com/microsoft/FluidFramework/blob/main/packages/framework/azure-client/README.md#backed-by-a-live-azure-fluid-relay-instance). Now, the configuration is using a real `tenantId` and the `InsecureTokenProvider` will need the matching `tenantKey` as provided during the service onboarding.

```javascript
const tokenProvider = new InsecureTokenProvider("YOUR-TENANT-KEY-HERE", { id: "123", name: "Test User" });
```

Again, this should ONLY be used for local development as including the tenant key in the client code risks allowing malicious users to sniff it from the client bundle. Please consider using the [AzureFunctionTokenProvider](https://github.com/microsoft/FluidFramework/blob/main/packages/framework/azure-client/src/AzureFunctionTokenProvider.ts) or your own implementation that fulfills the `ITokenProvider` interface as an alternative for production scenarios.

## generateTestUser

A simple function that will generate a test user. This is to be used in conjuntion with `InsecureTokenProvider`. The response object will be `{ id: string, name: string}`. `id` will be a uuid and `name` will be a randomly generated friendly first and last name  seperated by a space.

### Usage

```javascript
const tokenProvider = new InsecureTokenProvider("YOUR-TENANT-KEY-HERE", generateTestUser());
```