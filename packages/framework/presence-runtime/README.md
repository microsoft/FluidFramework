# @fluid-internal/presence-runtime

## Source organization

```
        @fluidframework/presence
                  |
        +---------^---------+-------+
        |                   |       |
    ./states           ./runtime    |
        |                   |       |
        ^---------v---------+       |
        |         |         |       |
        |   ./workspace     |       |
        |         |         |       |
        ^-------v-+---------^       |
        |       |           |       |
        |   ./utils         |       |
        |       |           |       |
        ^-------^---v-------^-------^
                    |
    @fluid-internal/presence-definitions
```

### utils

**Purpose:** Utility functions and shared implementations.

**Files:**
- `internalUtils.ts` → `objectEntries`, `objectKeys`, `getOrCreateRecord`, JSON helpers
- `timerManager.ts` → `TimerManager` class
- `broadcastControls.ts` → `OptionalBroadcastControl`, `RequiredBroadcastControl` classes
- `valueManager.ts` → `brandIVM`, `unbrandIVM`

### workspace

**Purpose:** Workspace abstractions and state datastore contracts.

**Files:**
- `stateDatastore.ts` → `StateDatastore` interface, `handleFromDatastore`, `datastoreFromHandle`
- `presenceStates.ts` → `PresenceStatesImpl`, `createPresenceStates`, workspace implementation

### runtime

**Purpose:** Core runtime - presence manager, datastore manager, system workspace.

**Files:**
- `presenceDatastoreManager.ts` → `PresenceDatastoreManagerImpl`
- `presenceManager.ts` → `PresenceManager` class, `createPresenceManager`
- `protocol.ts` → Message type definitions, `joinMessageType`, `datastoreUpdateMessageType`, `acknowledgementMessageType`
- `runtimeTypes.ts` → `IEphemeralRuntime`, `ExtensionHost`
- `systemWorkspace.ts` → `SystemWorkspace`, `createSystemWorkspace`

### states

**Purpose:** State manager implementations.

**Files:**
- `latestMapValueManager.ts` → `latestMap` factory
- `latestValueManager.ts` → `latest` factory
- `notificationsManager.ts` → `NotificationsManager`, `Notifications` factory
- `presence.ts` → `SpecificAttendee`
- `stateFactory.ts` → `StateFactory` object
- `validatedGetter.ts` → `createValidatedGetter`
