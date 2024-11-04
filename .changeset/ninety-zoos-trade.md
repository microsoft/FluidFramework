---
"@fluid-experimental/presence": minor
---
---
"section": feature
---

Presence `ISessionClient` connectivity status added

1. `ISessionClient` is updated to indicate current connectivity status via new method `getConnectionStatus()` with two possible states `Connected` and `Disconnected`.
2. `ISessionClient` member `connectionId()` has been renamed to `getConnectionId()` for consistency.
3. `IPresence` event `attendeeDisconnected` is now implemented.
