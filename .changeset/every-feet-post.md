---
"@fluidframework/driver-definitions": minor
"@fluidframework/container-loader": minor
"@fluidframework/odsp-driver": minor
"__section": fix
---

Preserve driver state in pending container state

Pending container state now captures and restores opaque driver state before reconnecting. ODSP uses this to retain the cached epoch, allowing restored files to reject stale pending state after a server-side restore.
