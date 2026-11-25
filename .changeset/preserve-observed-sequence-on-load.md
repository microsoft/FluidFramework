---
"@fluidframework/container-loader": minor
"__section": fix
---

Wait for known updates when loading an older snapshot

Loading a container now preserves the latest known sequence number when the service connection completes before snapshot initialization.
This prevents catch-up checks from reporting completion before updates already known to the connection have been processed.
