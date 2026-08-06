# @fluid-internal/presence-runtime

This is an internal package containing implementations of `presence` APIs.
`presence` APIs should be accessed via `@fluidframework/presence` package.

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

**Exposes:** extension elements `ContainerPresenceFactory` and `extensionId`

**Files:**
- `extension/containerPresence.ts` → `ContainerPresenceFactory`, `extensionId`
- `presenceDatastoreManager.ts` → `PresenceDatastoreManagerImpl`
- `presenceManager.ts` → `PresenceManager` class, `createPresenceManager`
- `protocol.ts` → Message type definitions, `joinMessageType`, `datastoreUpdateMessageType`, `acknowledgementMessageType`
- `runtimeTypes.ts` → `IEphemeralRuntime`, `ExtensionHost`
- `systemWorkspace.ts` → `SystemWorkspace`, `createSystemWorkspace`

### states

**Purpose:** State manager implementations.

**Exposes:** `StateFactory` and `Notifications` (factory)

**Files:**
- `latestMapValueManager.ts` → `latestMap` factory
- `latestValueManager.ts` → `latest` factory
- `notificationsManager.ts` → `NotificationsManager`, `Notifications` factory
- `presence.ts` → `SpecificAttendee`
- `stateFactory.ts` → `StateFactory` object
- `validatedGetter.ts` → `createValidatedGetter`
