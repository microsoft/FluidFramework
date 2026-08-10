---
"@fluidframework/fluid-static": minor
"@fluidframework/azure-client": minor
"@fluidframework/tinylicious-client": minor
"__section": breaking
"__highlight": true
---

Remove deprecated compatibility mode APIs

Deprecated `CompatibilityMode` exports and overloads have been removed from `@fluidframework/fluid-static`, `@fluidframework/azure-client`, and `@fluidframework/tinylicious-client`.

Use `OldestSupportedClientVersion` SemVer strings instead:

- Pass `oldestSupportedClient` to `createTreeContainerRuntimeFactory`.
- Pass an `OldestSupportedClientVersion` as the `oldestSupportedClient` argument to `AzureClient.createContainer`, `AzureClient.getContainer`, `AzureClient.viewContainerVersion`, `TinyliciousClient.createContainer`, and `TinyliciousClient.getContainer`.
- Replace legacy mode `"2"` with `oldestSupportedClient: "2.0.0"` or a later supported version.
- Legacy mode `"1"` has no supported Client 3.0 equivalent because Client 3.0 requires `oldestSupportedClient` to be at least `"2.0.0"`. Upgrade all collaborating clients before moving the application to Client 3.0.

See [Remove `CompatibilityMode`](https://github.com/microsoft/FluidFramework/issues/23289) and [advance the minimum collaboration version to 2.0.0](https://github.com/microsoft/FluidFramework/issues/27460) for more information.
