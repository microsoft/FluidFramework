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
| `PresenceNotifications` | `NotificationsWorkspace` |
| `PresenceNotificationsSchema` | `NotificationsWorkspaceSchema` |
| `PresenceStates` | `StatesWorkspace` |
| `PresenceStatesEntries` | `StatesWorkspaceEntries` |
| `PresenceStatesSchema` | `StatesWorkspaceSchema` |
| `PresenceWorkspaceAddress` | `WorkspaceAddress` |
| `PresenceWorkspaceEntry` | `StatesWorkspaceEntry` |
| `ClientSessionId` | `AttendeeId` |
| `IPresence` | `Presence` |
| `ISessionClient` | `Attendee` |
| `SessionClientStatus` | `AttendeeStatus` |
| `SpecificSessionClientId` | `SpecificAttendeeId` |
| `SpecificSessionClient` | `SpecificAttendee` |
| `acquirePresence` | `getPresence` |
| `acquirePresenceViaDataObject` | `getPresenceViaDataObject` |

```json
{
    "PresenceNotifications": "NotificationsWorkspace",
    "PresenceNotificationsSchema": "NotificationsWorkspaceSchema",
    "PresenceStates": "StatesWorkspace",
    "PresenceStatesEntries": "StatesWorkspaceEntries",
    "PresenceStatesSchema": "StatesWorkspaceSchema",
    "PresenceWorkspaceAddress": "WorkspaceAddress",
    "PresenceWorkspaceEntry": "StatesWorkspaceEntry",
    "ClientSessionId": "AttendeeId",
    "IPresence": "Presence",
    "ISessionClient": "Attendee",
    "SessionClientStatus": "AttendeeStatus",
    "SpecificSessionClientId": "SpecificAttendeeId",
    "SpecificSessionClient": "SpecificAttendee",
    "acquirePresence": "getPresence",
    "acquirePresenceViaDataObject": "getPresenceViaDataObject"
}
```
The JSON table above can be used to automate most of these replacements in your codebase. You can implement a simple script that reads this JSON and performs the necessary replacements in your files.
