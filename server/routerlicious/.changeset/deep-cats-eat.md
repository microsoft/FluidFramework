---
"@fluidframework/server-services-core": "minor"
---

server-services-core: Fix: Limit max length of validParentSummaries in checkpoints

Limits maximum number of tracked valid parent (service) summaries to 10 by default. Configurable via
`IScribeServerConfiguration` in `scribe` property of `IServiceConfiguration`.

You can find more details in [pull request #20850](https://github.com/microsoft/FluidFramework/pull/20850).
