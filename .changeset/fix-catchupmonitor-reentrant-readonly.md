---
"@fluidframework/container-loader": minor
"__section": fix
---
Fix container crash when read-only mode is forced from a connected event handler

Forcing a container into read-only mode synchronously from within a "connected" event handler could leave an internal catch-up monitor in an inconsistent state, causing a later reconnection to fail with an assert ("catchUpMonitor should be gone", `0x3eb`).

This occurred when a client established an already-caught-up read connection and application code reacted to the resulting connection transition by disconnecting (for example, by forcing read-only mode). The catch-up monitor is now stored before it can synchronously notify listeners, so a re-entrant disconnect during the connection transition is handled correctly and subsequent reconnections proceed normally.
