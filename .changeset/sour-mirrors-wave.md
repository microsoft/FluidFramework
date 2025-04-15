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
| `IPresence.events["attendeeJoined"]` | `Presence.attendees.events["attendeeJoined"]` |
| `IPresence.events["attendeeDisconnected"]` | `Presence.attendees.events["attendeeDisconnected"]` |
| `IPresence.getAttendee` | `Presence.attendees.getAttendee` |
| `IPresence.getAttendees` | `Presence.attendees.getAttendees` |
| `IPresence.getMyself` | `Presence.attendees.getMyself` |
| `IPresence.getNotifications` | `Presence.notifications.getWorkspace` |
| `IPresence.getStates` | `Presence.states.getWorkspace` |
| `ISessionClient` | `Attendee` |
| `Latest` (import) | `StateFactory` |
| `Latest` (call) | `StateFactory.latest` |
| `LatestMap` (import) | `StateFactory` |
| `LatestMap` (call) | `StateFactory.latestMap` |
| `LatestMapItemValueClientData` | `LatestMapItemUpdatedClientData` |
| `LatestMapValueClientData` | `LatestMapClientData` |
| `LatestMapValueManager` | `LatestMap` |
| `LatestMapValueManager.clients` | `LatestMap.getRemoteClients` |
| `LatestMapValueManager.clientValue` | `LatestMap.getRemote` |
| `LatestMapValueManager.clientValues` | `LatestMap.getRemotes` |
| `LatestMapValueManagerEvents` | `LatestMapEvents` |
| `LatestValueClientData` | `LatestClientData` |
| `LatestValueData` | `LatestData` |
| `LatestValueManager` | `Latest` |
| `LatestValueManager.clients` | `Latest.getRemoteClients` |
| `LatestValueManager.clientValue` | `Latest.getRemote` |
| `LatestValueManager.clientValues` | `Latest.getRemotes` |
| `LatestValueManagerEvents` | `LatestEvents` |
| `LatestValueMetadata` | `LatestMetadata` |
| `PresenceEvents.attendeeDisconnected` | `AttendeesEvents.attendeeDisconnected`|
| `PresenceEvents.attendeeJoined` | `AttendeesEvents.attendeeJoined`|
| `PresenceNotifications` | `NotificationsWorkspace` |
| `PresenceNotificationsSchema` | `NotificationsWorkspaceSchema` |
| `PresenceStates` | `StatesWorkspace` |
| `PresenceStatesEntries` | `StatesWorkspaceEntries` |
| `PresenceStatesSchema` | `StatesWorkspaceSchema` |
| `PresenceWorkspaceAddress` | `WorkspaceAddress` |
| `PresenceWorkspaceEntry` | `StatesWorkspaceEntry` |
| `SessionClientStatus` | `AttendeeStatus` |
| `ValueMap` | `StateMap` |

Note: To fully replace OLD `Latest` and `LatestMap` functions, you should import `StateFactory` and call `StateFactory.latest` and `StateFactory.latestMap` respectively. NEW `Latest` and `LatestMap` APIs replace `LatestValueManager` and `LatestMapValueManager`.
