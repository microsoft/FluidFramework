---
"@fluidframework/container-loader": minor
---
---
section: deprecation
---

container-loader: summarizeProtocolTree and its corresponding duplicate ILoaderOptions definition is deprecated

The `summarizeProtocolTree` property in ILoaderOptions was added to test single-commit summaries during the initial
implementation phase. The flag is no longer required and should no longer be used, and is now marked deprecated. If a
driver needs to enable or disable single-commit summaries, it can do so via `IDocumentServicePolicies`.
