# @fluidframework/test-client-utils

## WARNING: This package is deprecated as of 2.0.0-internal.5.1.0 and will be removed in an upcoming release.

Utilities to use while developing and testing using the service-specific clients (i.e. `AzureClient`, `TinyliciousClient`) supplied by the FluidFramework.

<!-- AUTO-GENERATED-CONTENT:START (README_DEPENDENCY_GUIDELINES_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Using Fluid Framework libraries

When taking a dependency on a Fluid Framework library, we recommend using a `^` (caret) version range, such as `^1.3.4`.
While Fluid Framework libraries may use different ranges with interdependencies between other Fluid Framework libraries,
library consumers should always prefer `^`.

Note that when depending on a library version of the form 2.0.0-internal.x.y.z, called the Fluid internal version
scheme, you must use a `>= <` dependency range. Standard `^` and `~` ranges will not work as expected. See the
[@fluid-tools/version-tools](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/version-tools/README.md)
package for more information including tools to convert between version schemes.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## InsecureTokenProvider

The `InsecureTokenProvider` provides a class for locally generating JWT tokens, signed using a tenant key, that can be sent to Fluid services. These tokens will be used to authenticate and identify which user is sending operations from the client.

It takes in two parameters:

-   `tenantKey` - Used for signing the token for use with the `tenantId` that we are attempting to connect to on the service
-   `user` - Used to populate the current user's details in the audience currently editing the container

The `AzureClient`, from the `@fluidframework/azure-client` package, takes in a `tokenProvider` parameter as part of its constructor. This parameter can be fulfilled by using the `InsecureTokenProvider` that is exported here. However, it is advised to only use this for development or testing purposes as it risks exposing your Azure Fluid Relay service tenant key secret on your client side code.

### Usage for Development with Local Tinylicious Instance

When using the `AzureClient`, you can configure it to run against a local Tinylicous instance. Please see the client's [documentation on local development](https://github.com/microsoft/FluidFramework/blob/main/packages/framework/azure-client/README.md#backed-locally) for more information on how to do so. In this scenario, the `InsecureTokenProvider` will take any value for its `tenantKey` parameter since we're working with a local Tinylicious instance that doesn't require any authentication. As such, we can create an instance of it like this:

```javascript
const tokenProvider = new InsecureTokenProvider("fooBar", { id: "123", name: "Test User" });
```

### Usage for Development with Azure Fluid Relay service

The `AzureClient` can also be configured to a deployed Azure Fluid Relay service instance as described [here](https://github.com/microsoft/FluidFramework/blob/main/packages/framework/azure-client/README.md#backed-by-a-live-azure-fluid-relay-instance). Now, the configuration is using a real `tenantId` and the `InsecureTokenProvider` will need the matching `tenantKey` as provided during the service onboarding.

```javascript
const tokenProvider = new InsecureTokenProvider("YOUR-TENANT-KEY-HERE", {
	id: "123",
	name: "Test User",
});
```

Again, this should ONLY be used for local development as including the tenant key in the client code risks allowing malicious users to sniff it from the client bundle. Please consider using the [AzureFunctionTokenProvider](https://github.com/microsoft/FluidFramework/blob/main/packages/framework/azure-client/src/AzureFunctionTokenProvider.ts) or your own implementation that fulfills the `ITokenProvider` interface as an alternative for production scenarios.

## generateTestUser

A simple function that will generate a test user. This is to be used in conjuntion with `InsecureTokenProvider`. The response object will be `{ id: string, name: string}`. `id` will be a uuid and `name` will be a randomly generated friendly first and last name seperated by a space.

### Usage

```javascript
const tokenProvider = new InsecureTokenProvider("YOUR-TENANT-KEY-HERE", generateTestUser());
```

<!-- AUTO-GENERATED-CONTENT:START (README_TRADEMARK_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand
Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
