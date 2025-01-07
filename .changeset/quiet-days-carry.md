---
"@fluidframework/container-runtime": minor
---
---
"section": legacy
---

Grouped batching is enabled by default and cannot be disabled

The Grouped Batching feature in the container runtime has stabilized and is now enabled by default.

The `IContainerRuntimeOptions.enableGroupedBatching` option, which allowed an application to disable grouped batching, has been removed. Grouped Batching is now considered a core part of the container runtime, and as such can no longer be disabled.
