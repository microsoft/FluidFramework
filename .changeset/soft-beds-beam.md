---
"@fluidframework/azure-client": minor
"@fluidframework/odsp-client": minor
"@fluidframework/tinylicious-client": minor
"__section": deprecation
---
Service client createContainer/getContainer overloads taking CompatibilityMode are deprecated

The `createContainer` and `getContainer` overloads on `AzureClient`, `OdspClient`, and `TinyliciousClient` (plus `AzureClient.viewContainerVersion`) that accept a [`CompatibilityMode`](https://fluidframework.com/docs/api/fluid-static/compatibilitymode-typealias) (`"1"` / `"2"`) argument are now deprecated.
Pass a [`MinimumVersionForCollab`](https://fluidframework.com/docs/api/runtime-definitions/minimumversionforcollab-typealias) SemVer string instead — it specifies the minimum collaborating client version directly.

See [issue #23289](https://github.com/microsoft/FluidFramework/issues/23289) for migration details and removal tracking.
