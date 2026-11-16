---
"@fluidframework/container-loader": minor
"__section": legacy
---
Reference-mode capture now includes structural contents for offline loading

`captureFullContainerState` with `blobCaptureMode: "reference"` now retains structural snapshot contents and saved operations while omitting attachment payloads, allowing structural state to load offline.
The default remains `"inline"`.
Reference captures can be larger and perform more structural reads than before.
Accessing an omitted attachment requires online storage and succeeds only while storage retains it.

Legacy reference-only captures omit structural payloads too and require online driver wiring.
Recapture with a loader that includes structural contents in reference mode if offline structural loading is needed.
State reserialized from a reference capture retains the attachment omission metadata so offline attachment access continues to report capture-specific error guidance.

Both capture modes now preserve non-UTF-8 structural blob contents instead of corrupting them during serialization.
Captures and state reserialized by containers loaded from them can contain tagged base64 entries that older loaders cannot read.
Use updated loaders when reading these artifacts, including during application rollback.
Ordinary pending-state, detached-state, and loading-group serialization keep their existing string encoding unless continuing a captured session; their existing binary-content limitations are unchanged.
