---
"@fluidframework/container-loader": minor
---
---
"section": other
---

Removed deprecated `ILoaderOptions` exported from container-loader.

Previously `ILoaderOptions` exported from `container-loader` was extending the base `ILoaderOptions` defined in `container-definitions` to add an experimental `summarizeProtocolTree` property which was used to test single-commit summaries. The option is no longer required or in use, so the extended version of `ILoaderOptions` is not needed anymore.
