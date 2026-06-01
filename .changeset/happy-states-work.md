---
"@fluidframework/fluid-static": minor
"@fluidframework/azure-client": minor
"@fluidframework/tinylicious-client": minor
"__section": legacy
---

Remove deprecated CompatibilityMode APIs

Deprecated `CompatibilityMode` exports and overloads have been removed from `@fluidframework/fluid-static`, `@fluidframework/azure-client`, and `@fluidframework/tinylicious-client`.

Use `MinimumVersionForCollab` SemVer strings instead:

- Pass `minVersionForCollaboration` to `createTreeContainerRuntimeFactory`.
- Pass a `MinimumVersionForCollab` argument to `AzureClient.createContainer`, `AzureClient.getContainer`, `AzureClient.viewContainerVersion`, `TinyliciousClient.createContainer`, and `TinyliciousClient.getContainer`.
- Replace legacy mode values `"1"` and `"2"` with `"1.0.0"` and `"2.0.0"`.
