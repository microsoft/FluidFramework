---
title: Presence
sidebar_postition: 10
---

## Overview

We are introducting a new way to power your ephemeral experiences wth Fluid. Introducing the new Presence APIs (currently in alpha) that provide session-focused utilities for lightweight data sharing and messaging.

Collaborative features typically rely on each user maintaining their own temporary state, which is subsequently shared with others. For example, in applications featuring multiplayer cursors, the cursor position of each user signifies their state. This state can be further utilized for various purposes such as indicating typing activity or displaying a user's current selection. This concept is referred to as _presence_.

By leveraging this shared state, applications can provide a seamless and interactive collaborative experience, ensuring that users are always aware of each other's actions and selections in real-time.

The key scenarios that the new Presence APIs are suitable for includes:

-   User presence
-   Collaborative cursors
-   Notifications

## Concepts

A session is a period of time when one or more clients are connected to a Fluid service. Session data and messages may be exchanged among clients, but will disappear once the no clients remain. (More specifically once no clients remain that have acquired the session `IPresence` interface.) Once fully implemented, no client will require container write permissions to use Presence features.

### Attendees

For the lifetime of a session, each client connecting will be established as a unique and stable `ISessionClient`. The representation is stable because it will remain the same `ISessionClient` instance independent of connection drops and reconnections.

Client Ids maintained by `ISessionClient` may be used to associate `ISessionClient` with quorum, audience, and service audience members.

### Workspaces

Within Presence data sharing and messaging is broken into workspaces with custom identifiers (workspace addresses). Clients must use the same address within a session to connect with others. Unique addresses enable logical components within a client runtime to remain isolated or work together (without other piping between those components).

There are two types of workspaces: States and Notifications.

#### States Workspace

A states workspace, `PresenceStates`, allows sharing of simple data across attendees where each attendee maintains their own data values that others may read, but not change. This is distinct from a Fluid DDS where data values might be manipulated by multiple clients and one ultimate value is derived. Shared, independent values are maintained by value managers that specialize in incrementality and history of values.

#### Notifications Workspace

A notifications workspace, `PresenceNotifications`, is similar to states workspace, but is dedicated to notification use-cases via `NotificationsManager`.

### Value Managers

#### LatestValueManager

Latest value manager retains the most recent atomic value each attendee has shared. Use `Latest` to add one to `PresenceStates` workspace.

#### LatestMapValueManager

Latest map value manager retains the most recent atomic value each attendee has shared under arbitrary keys. Values associated with a key may be nullified (appears as deleted). Use `LatestMap` to add one to `PresenceStates` workspace.

#### NotificationsManager

Notifications value managers are special case where no data is retained during a session and all interactions appear as events that are sent and received. Notifications value managers may be mixed into a `PresenceStates` workspace for convenience. They are the only type of value managers permitted in a `PresenceNotifications` workspace. Use `Notifications` to add one to `PresenceNotifications` or `PresenceStates` workspace.

## Onboarding

While this package is developing as experimental and other Fluid Framework internals are being updated to accommodate it, a temporary Shared Object must be added within container to gain access.

```typescript
import {
	acquirePresenceViaDataObject,
	ExperimentalPresenceManager,
} from "@fluidframework/presence/alpha";

const containerSchema = {
	initialObjects: {
		presence: ExperimentalPresenceManager,
	},
} satisfies ContainerSchema;

const presence = await acquirePresenceViaDataObject(container.initialObjects.presence);
```

## Limitations

### States Reliability

The current implementation relies on Fluid Framework's signal infrastructure instead of ops. This has advantages, but comes with some risk of unreliable messaging. The most common known case of unreliable signals occurs during reconnection periods and the current implementation attempts to account for that. Be aware that all clients are not guaranteed to arrive at eventual consistency. Please [file a new issue](https://github.com/microsoft/FluidFramework/issues/new?assignees=&labels=bug&projects=&template=bug_report.md&title=Presence:%20States:%20) if one is not found under [Presence States issues](https://github.com/microsoft/FluidFramework/issues?q=is%3Aissue+%22Presence%3A+States%3A%22).

### Compatibility and Versioning

Current API does not provide a mechanism to validate that state and notification data received within session from other clients matches the types declared. The schema of workspace address, states and notifications names, and their types will only be consistent when all clients connected to the session are using the same types for a unique value/notification path (workspace address + name within workspace). In other words, don't mix versions or make sure to change identifiers when changing types in a non-compatible way.

Example:

```typescript
presence.getStates("app:v1states", { myState: Latest({ x: 0 }) });
```

is incompatible with

```typescript
presence.getStates("app:v1states", { myState: Latest({ x: "text" }) });
```

as "app:v1states"+"myState" have different value type expectations: `{x: number}` versus `{x: string}`.

```typescript
presence.getStates("app:v1states", { myState2: Latest({ x: true }) });
```

would be compatible with both of the prior schemas as "myState2" is a different name. Though in this situation none of the different clients would be able to observe each other.

### Notifications

Notifications API is partially implemented. All messages are always broadcast even if `unicast` API is used. Type inferences are not working even with a fully specified `initialSubscriptions` value provided to `Notifications` and schema type must be specified explicitly.

Notifications are fundamentally unreliable at this time as there are no built-in acknowledgements nor retained state. To prevent most common loss of notifications, always check for connection before sending.

### Throttling/grouping

Presence updates are grouped together and throttled to prevent flooding the network with messages when presence values are rapidly updated. This means the presence infrastructure will not immediately broadcast updates but will broadcast them after a configurable delay.

The `allowableUpdateLatencyMs` property configures how long a local update may be delayed under normal circumstances, enabling grouping with other updates. The default `allowableUpdateLatencyMs` is **60 milliseconds** but may be (1) specified during configuration of a [States Workspace](#states-workspace) or [Value Manager](#value-managers) and/or (2) updated later using the `controls` member of Workspace or Value Manager. [States Workspace](#states-workspace) configuration applies when a Value Manager does not have its own setting.

Notifications are never queued; they effectively always have an `allowableUpdateLatencyMs` of 0. However, they may be grouped with other updates that were already queued.

Note that due to throttling, clients receiving updates may not see updates for all values set by another. For example,
with `Latest*ValueManagers`, the only value sent is the value at the time the outgoing grouped message is sent. Previous
values set by the client will not be broadcast or seen by other clients.

#### Example

You can configure the grouping and throttling behavior using the `allowableUpdateLatencyMs` property as in the following example:

```ts
// Configure a states workspace
const stateWorkspace = presence.getStates(
	"app:v1states",
	{
		// This value manager has an allowable latency of 100ms.
		position: Latest({ x: 0, y: 0 }, { allowableUpdateLatencyMs: 100 }),
		// This value manager uses the workspace default.
		count: Latest({ num: 0 }),
	},
	// Specify the default for all value managers in this workspace to 200ms,
	// overriding the default value of 60ms.
	{ allowableUpdateLatencyMs: 200 },
);

// Temporarily set count updates to send as soon as possible
const countState = stateWorkspace.props.count;
countState.controls.allowableUpdateLatencyMs = 0;
countState.local = { num: 5000 };

// Reset the update latency to the workspace default
countState.controls.allowableUpdateLatencyMs = undefined;
```
