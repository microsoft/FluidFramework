---
"@fluidframework/azure-end-to-end-tests": minor
"@fluidframework/presence": minor
---
---
"section": other
---

Presence API renames

List of Presence API changes:

```
export type {
    PresenceNotifications -> NotificationsWorkspace,
    PresenceNotificationsSchema -> NotificationsWorkspaceSchema,
    PresenceStates -> StatesWorkspace,
    PresenceStatesEntries -> StatesWorkspaceEntries,
    PresenceStatesSchema -> StatesWorkspaceSchema,
    PresenceWorkspaceAddress -> StatesWorkspaceAddress,
    PresenceWorkspaceEntry -> StatesWorkspaceEntry,
} from "./types.js";

export {
    type ClientSessionId -> AttendeeId,
    type IPresence -> Presence,
    type ISessionClient -> Attendee,
    SessionClientStatus -> AttendeeStatus,
} from "./presence.js";

export { acquirePresence -> getPresence } from "./experimentalAccess.js";
```

Also changed adjacent API to the ones mentioned above, such as `SpecificSessionClientId` to `SpecificAttendeeId`, `SpecificSessionClient` to `SpecificAttendee`, and `acquirePresenceViaDataObject` to `getPresenceViaDataObject`.
