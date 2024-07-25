---
"@fluidframework/container-loader": minor
---

Deprecated summarizeProtocolTree and it's corresponding duplicate ILoaderOptions definition from container layer.

summarizeProtocolTree property in ILoaderOptions was added to test single-commit summaries during the initial implementation phase. The flag is no longer required and should no longer be used, so marked it as deprecated. If a driver needs to enable or disable single-commit summaries, it can do so via IDocumentServicePolicies.
