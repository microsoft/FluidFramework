---
"@fluid-experimental/presence": minor
---
---
"section": feature
---

ISessionClient now exposes connectivity information

1. `ISessionClient` has a new method, `getConnectionStatus()`, with two possible states: `Connected` and `Disconnected`.
2. `ISessionClient`'s `connectionId()` member has been renamed to `getConnectionId()` for consistency.
3. `IPresence` event `attendeeDisconnected` is now implemented.
