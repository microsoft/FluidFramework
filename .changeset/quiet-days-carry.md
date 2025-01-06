---
"@fluidframework/container-runtime": minor
---
---
"section": legacy
---

Grouped batching is enabled by default and IContainerRuntimeOptinos.enableGroupedBatching has been removed

This option allowed an application to disable grouped batching. But now we no longer want users to be able to turn it on or off, so this option can be removed and it will always be enabled by default.
