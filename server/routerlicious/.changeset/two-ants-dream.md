---
"@fluidframework/server-lambdas": "minor"
"@fluidframework/server-services-core": "minor"
---

server-lambdas, server-services-core: SessionStartMetric removed from Scribe and Deli microservices

This change removes the SessionStartMetric from Scribe and Deli. The metric is a source of bugs and has been superseded
by the `restoreFromCheckpoint` and `RunService` metrics.

You can find more details about the reasons for this change in
[pull request #21125](https://github.com/microsoft/FluidFramework/pull/21125).
