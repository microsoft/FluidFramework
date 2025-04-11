---
"@fluidframework/presence": minor
---
---
"section": other
---

Presence API renames

The following API changes have been made to improve clarity and consistency:

| Original | New |
|----------|-----|
| `acquirePresence` | `getPresence` |
| `acquirePresenceViaDataObject` | `getPresenceViaDataObject` |
| `ClientSessionId` | `AttendeeId` |
| `IPresence` | `Presence` |
| `ISessionClient` | `Attendee` |
| `Latest` | `latestStateFactory` |
| `LatestMap` | `latestMapFactory` |
| `LatestMapItemValueClientData` | `LatestMapItemUpdatedClientData` |
| `LatestMapValueClientData` | `LatestMapClientData` |
| `LatestMapValueManager` | `LatestMap` |
| `LatestMapValueManagerEvents` | `LatestMapEvents` |
| `LatestValueClientData` | `LatestClientData` |
| `LatestValueData` | `LatestData` |
| `LatestValueManager` | `Latest` |
| `LatestValueManagerEvents` | `LatestEvents` |
| `LatestValueMetadata` | `LatestMetadata` |
| `PresenceNotifications` | `NotificationsWorkspace` |
| `PresenceNotificationsSchema` | `NotificationsWorkspaceSchema` |
| `PresenceStates` | `StatesWorkspace` |
| `PresenceStatesEntries` | `StatesWorkspaceEntries` |
| `PresenceStatesSchema` | `StatesWorkspaceSchema` |
| `PresenceWorkspaceAddress` | `WorkspaceAddress` |
| `PresenceWorkspaceEntry` | `StatesWorkspaceEntry` |
| `SessionClientStatus` | `AttendeeStatus` |
| `ValueMap` | `StateMap` |

```json
{
    "acquirePresence": "getPresence",
    "acquirePresenceViaDataObject": "getPresenceViaDataObject",
    "ClientSessionId": "AttendeeId",
    "IPresence": "Presence",
    "ISessionClient": "Attendee",
    "Latest": "latestStateFactory",
    "LatestMap": "latestMapFactory",
    "LatestMapItemValueClientData": "LatestMapItemUpdatedClientData",
    "LatestMapValueClientData": "LatestMapClientData",
    "LatestMapValueManager": "LatestMap",
    "LatestMapValueManagerEvents": "LatestMapEvents",
    "LatestValueClientData": "LatestClientData",
    "LatestValueData": "LatestData",
    "LatestValueManager": "Latest",
    "LatestValueManagerEvents": "LatestEvents",
    "LatestValueMetadata": "LatestMetadata",
    "PresenceNotifications": "NotificationsWorkspace",
    "PresenceNotificationsSchema": "NotificationsWorkspaceSchema",
    "PresenceStates": "StatesWorkspace",
    "PresenceStatesEntries": "StatesWorkspaceEntries",
    "PresenceStatesSchema": "StatesWorkspaceSchema",
    "PresenceWorkspaceAddress": "WorkspaceAddress",
    "PresenceWorkspaceEntry": "StatesWorkspaceEntry",
    "SessionClientStatus": "AttendeeStatus",
    "ValueMap": "StateMap"
}
```
The JSON table above can be used to automate most of these replacements in your codebase. You can implement a simple script that reads this JSON and performs the necessary replacements in your files.
