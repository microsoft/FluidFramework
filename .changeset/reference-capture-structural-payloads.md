---
"@fluidframework/container-loader": minor
"__section": legacy
---
Reference-mode capture now includes structural contents for offline loading

`captureFullContainerState` with `blobCaptureMode: "reference"` now includes structural blob contents, fixing offline structural loads that previously failed because those contents were omitted.
Reference captures are larger; attachment payloads remain omitted and require live storage to read.

Both capture modes now preserve non-UTF-8 structural blob contents instead of corrupting them during serialization.
Captures containing these binary blobs, and state reserialized from them, require updated loaders; older loaders cannot read them, including during application rollback.
