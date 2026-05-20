---
"@fluidframework/azure-client": minor
"@fluidframework/odsp-client": minor
"@fluidframework/tinylicious-client": minor
"__section": deprecation
---
Service client createContainer/getContainer overloads taking CompatibilityMode are deprecated

The `createContainer` and `getContainer` overloads on `AzureClient`, `OdspClient`, and `TinyliciousClient` (plus `AzureClient.viewContainerVersion`) that accept a [`CompatibilityMode`](https://fluidframework.com/docs/api/fluid-static/compatibilitymode-typealias) (`"1"` / `"2"`) argument are now deprecated.
Pass a [`MinimumVersionForCollab`](https://fluidframework.com/docs/api/runtime-definitions/minimumversionforcollab-typealias) SemVer string instead — it specifies the minimum collaborating client version directly.

```ts
// Before
const { container, services } = await client.createContainer(schema, "2");

// After
const { container, services } = await client.createContainer(schema, "2.0.0");
```
