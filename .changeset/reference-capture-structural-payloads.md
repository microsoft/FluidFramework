---
"@fluidframework/container-loader": minor
"__section": legacy
---
Reference-mode capture preserves structural snapshot contents

`captureFullContainerState` with `blobCaptureMode: "reference"` now retains structural snapshot contents, attachment references, and saved operations while omitting attachment bytes.
The default remains `"inline"`; no new mode is introduced.
Reference captures can be larger and perform more structural reads than before.
Structural summary blobs retain their original bytes, including non-UTF-8 binary contents.
Text keeps its legacy serialized representation; binary entries use tagged base64 and require an updated loader to replay.

Reference capture uses the same snapshot-subtree filtering as inline capture; this change does not fix existing capture-completeness limitations.
Offline loading requires a URL accepted by `tryParseCompatibleResolvedUrl` and fails if an omitted attachment is accessed.
Reference capture retains its existing capture-time URL compatibility; URL validation remains the loader's responsibility.
Online access to an omitted attachment succeeds only while storage retains it; retention and garbage collection are unchanged.

Legacy reference captures, including those produced by version 3.12, omitted structural payloads too and still require live driver wiring.
Recapture with this version if offline structural loading is needed.
