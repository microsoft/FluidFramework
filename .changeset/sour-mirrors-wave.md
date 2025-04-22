---
"@fluidframework/presence": minor
"__section": other
---

Presence APIs have been renamed

The following API changes have been made to improve clarity and consistency:

| Before 2.33.0 | 2.33.0 |
|----------|-----|
| `acquirePresence` | `getPresence` |
| `acquirePresenceViaDataObject` | `getPresenceViaDataObject` |
| `ClientSessionId` | `AttendeeId` |
| `IPresence` | `Presence` |
| `IPresence.events["attendeeJoined"]` | `Presence.attendees.events["attendeeConnected"]` |
| `IPresence.events["attendeeDisconnected"]` | `Presence.attendees.events["attendeeDisconnected"]` |
| `IPresence.getAttendee` | `Presence.attendees.getAttendee` |
| `IPresence.getAttendees` | `Presence.attendees.getAttendees` |
| `IPresence.getMyself` | `Presence.attendees.getMyself` |
| `IPresence.getNotifications` | `Presence.notifications.getWorkspace` |
| `IPresence.getStates` | `Presence.states.getWorkspace` |
| `ISessionClient` | `Attendee` |
| `Latest` (import) | `StateFactory` |
| `Latest` (call) | `StateFactory.latest` |
| `LatestEvents.updated` | `LatestEvents.remoteUpdated` |
| `LatestMap` (import) | `StateFactory` |
| `LatestMap` (call) | `StateFactory.latestMap` |
| `LatestMapEvents.itemRemoved` | `LatestMapEvents.remoteItemRemoved` |
| `LatestMapEvents.itemUpdated` | `LatestMapEvents.remoteItemUpdated` |
| `LatestMapEvents.updated` | `LatestMapEvents.remoteUpdated` |
| `LatestMapItemValueClientData` | `LatestMapItemUpdatedClientData` |
| `LatestMapValueClientData` | `LatestMapClientData` |
| `LatestMapValueManager` | `LatestMap` |
| `LatestMapValueManager.clients` | `LatestMap.getStateAttendees` |
| `LatestMapValueManager.clientValue` | `LatestMap.getRemote` |
| `LatestMapValueManager.clientValues` | `LatestMap.getRemotes` |
| `LatestMapValueManagerEvents` | `LatestMapEvents` |
| `LatestValueClientData` | `LatestClientData` |
| `LatestValueData` | `LatestData` |
| `LatestValueManager` | `Latest` |
| `LatestValueManager.clients` | `Latest.getStateAttendees` |
| `LatestValueManager.clientValue` | `Latest.getRemote` |
| `LatestValueManager.clientValues` | `Latest.getRemotes` |
| `LatestValueManagerEvents` | `LatestEvents` |
| `LatestValueMetadata` | `LatestMetadata` |
| `PresenceEvents.attendeeDisconnected` | `AttendeesEvents.attendeeDisconnected`|
| `PresenceEvents.attendeeJoined` | `AttendeesEvents.attendeeConnected`|
| `PresenceNotifications` | `NotificationsWorkspace` |
| `PresenceNotifications.props` | `NotificationsWorkspace.notifications` |
| `PresenceNotificationsSchema` | `NotificationsWorkspaceSchema` |
| `PresenceStates` | `StatesWorkspace` |
| `PresenceStates.props` | `StatesWorkspace.states` |
| `PresenceStatesEntries` | `StatesWorkspaceEntries` |
| `PresenceStatesSchema` | `StatesWorkspaceSchema` |
| `PresenceWorkspaceAddress` | `WorkspaceAddress` |
| `PresenceWorkspaceEntry` | `StatesWorkspaceEntry` |
| `SessionClientStatus` | `AttendeeStatus` |
| `ValueMap` | `StateMap` |

> [!NOTE]
> To fully replace the former `Latest` and `LatestMap` functions, you should import `StateFactory` and call `StateFactory.latest` and `StateFactory.latestMap` respectively. The new `Latest` and `LatestMap` APIs replace `LatestValueManager` and `LatestMapValueManager` respectively.
