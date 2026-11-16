---
"@fluidframework/container-loader": minor
"__section": fix
---
Inline capture retains unreferenced snapshot contents

`captureFullContainerState` in its default `"inline"` mode retains structural blobs beneath unreferenced snapshot subtrees and GC-unreferenced attachment payloads.
These objects can become referenced again through saved or future operations, so their contents are needed to continue from the captured state without historical storage reads.

Tombstoned or deleted attachment local IDs remain excluded, but eligible storage-ID aliases can retain the same payload.
Capture size and blob reads can increase.
Runtime garbage collection, storage retention, and `"reference"` capture behavior are unchanged.
