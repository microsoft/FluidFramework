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
| `LatestMapValueManager` | `LatestMapRaw` |
| `LatestMapValueManager.clients` | `LatestMapRaw.getStateAttendees` |
| `LatestMapValueManager.clientValue` | `LatestMapRaw.getRemote` |
| `LatestMapValueManager.clientValues` | `LatestMapRaw.getRemotes` |
| `LatestMapValueManagerEvents` | `LatestMapRawEvents` |
| `LatestValueClientData` | `LatestClientData` |
| `LatestValueData` | `LatestData` |
| `LatestValueManager` | `LatestRaw` |
| `LatestValueManager.clients` | `LatestRaw.getStateAttendees` |
| `LatestValueManager.clientValue` | `LatestRaw.getRemote` |
| `LatestValueManager.clientValues` | `LatestRaw.getRemotes` |
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
> To fully replace the former `Latest` and `LatestMap` functions, you should import `StateFactory` and call `StateFactory.latest` and `StateFactory.latestMap` respectively. The new `LatestRaw` and `LatestMapRaw` APIs replace `LatestValueManager` and `LatestMapValueManager` respectively.
