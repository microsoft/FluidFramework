---
"@fluidframework/container-runtime": minor
"@fluidframework/fluid-static": minor
---
---
"section": deprecation
---

Marked `IContainerRuntimeOptions.enableGroupedBatching` as deprecated

- We will remove the ability to disable Grouped Batching in v2.20.0. The only exception (i.e. where Grouped Batching would be disabled) is for compatibility with older (v1) clients, and this will be implemented without needing to expose `IContainerRuntimeOptions.enableGroupedBatching`.
