---
"@fluidframework/container-runtime": minor
"@fluidframework/fluid-static": minor
---
---
"section": deprecation
---

Marked `IContainerRuntimeOptions.enableGroupedBatching` as deprecated

- We want to remove the ability to configure batch grouping, so `IContainerRuntimeOptions.enableGroupedBatching` is now being marked as deprecated and batch grouping will now depend on batch compression.
