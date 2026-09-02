---
"@fluidframework/container-loader": minor
"__section": fix
---
Full container state capture now includes recently sequenced operations

`captureFullContainerState` now connects to the delta stream and catches up through the latest operation known when the connection is established.
This prevents captured state from omitting operations that have been broadcast over the websocket but have not yet reached delta storage.
