---
"@fluidframework/container-loader": minor
"__section": legacy
---
Reference-mode capture supports offline structural loading

`captureFullContainerState` with `blobCaptureMode: "reference"` now retains structural snapshot contents and saved operations while omitting attachment payloads, allowing structural state to load offline.
The default remains `"inline"`.
Reference captures can be larger and perform more structural reads than before.
Accessing an omitted attachment requires online storage and succeeds only while storage retains it.

Reference captures produced by Fluid versions before 3.13 omitted structural payloads too and require online driver wiring.
Recapture with Fluid 3.13 or later if offline structural loading is needed.

The lossless blob format applies beyond capture: pending state from `getPendingLocalState`, detached state from `serialize()`, and serialized loading-group snapshots may now contain tagged base64 entries for non-UTF-8 blob contents.
Older loaders cannot read state containing these entries.
Use updated loaders for all readers of these artifacts, including during application rollback.
Existing text entries remain readable.
