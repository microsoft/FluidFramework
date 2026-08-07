---
"@fluidframework/container-loader": minor
"__section": fix
---

Detached container serialization now preserves binary attachment blobs

Serializing and rehydrating a detached container now stores attachment blob contents in a versioned base64 format, preventing non-UTF-8 bytes from being replaced. Previously serialized UTF-8 snapshots remain supported.
