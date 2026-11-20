---
"@fluidframework/container-loader": minor
"@fluidframework/container-definitions": minor
"__section": fix
---
Loading with opsBeforeReturn now processes fetched ops even when the runtime pauses op processing

When `IContainerLoadMode.opsBeforeReturn` is `"cached"` or `"all"`, `Container.load` fetches the ops that follow the snapshot and processes them before it returns.
Previously, if the runtime paused the inbound op queue while it processed these ops (for example, to yield the JavaScript thread after a time budget) and resumed it later, `Container.load` could return with many fetched ops still unprocessed.
Code that read the container state right after load (for example, through `getEntryPoint()`) then saw an older state.

`Container.load` now waits until it processes the ops that this fetch queued.
It does not wait for ops that arrive later, such as the ops of the background storage fetch for `"cached"`, or ops from the delta stream connection.
It still returns without the fetched ops if a component holds the queue paused (for example, while it waits for the rest of an incomplete batch).

The `IContainerLoadMode` documentation now describes each option and its limits.
