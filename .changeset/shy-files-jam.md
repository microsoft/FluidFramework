---
"@fluidframework/presence": minor
---
---
"section": feature
---

Presence updates are now batched and throttled

Presence updates are grouped together and throttled to prevent flooding the network with messages when presence values are rapidly updated. This means the presence infrastructure will not immediately broadcast updates but will broadcast them after a configurable delay.

The `allowableUpdateLatencyMs` property configures how long a local update may be delayed under normal circumstances, enabling batching with other updates. The default `allowableUpdateLatencyMs` is **60 milliseconds** but may be (1) specified during configuration of a [States Workspace](#states-workspace) or [Value Manager](#value-managers) and/or (2) updated later using the `controls` member of Workspace or Value Manager. [States Workspace](#states-workspace) configuration applies when a Value Manager does not have its own setting.

Notifications are never queued; they effectively always have an `allowableUpdateLatencyMs` of 0. However, they may be batched with other updates that were already queued.

Note that due to throttling, clients receiving updates may not see updates for all values set by another. For example,
with `Latest*ValueManagers`, the only value sent is the value at the time the outgoing batched message is sent. Previous
values set by the client will not be broadcast or seen by other clients.

#### Example

You can configure the batching and throttling behavior using the `allowableUpdateLatencyMs` property as in the following example:

```ts
// Configure a states workspace
const stateWorkspace = presence.getStates("app:v1states",
	{
		// This value manager has an allowable latency of 100ms.
		position: Latest({ x: 0, y: 0 }, { allowableUpdateLatencyMs: 100 }),
		// This value manager uses the workspace default.
		count: Latest({ num: 0 }),
	},
	// Specify the default for all value managers in this workspace to 200ms,
		// overriding the default value of 60ms.
	{ allowableUpdateLatencyMs: 200 }
);

// Temporarily set count updates to send as soon as possible
const countState = stateWorkspace.props.count;
countState.controls.allowableUpdateLatencyMs = 0;
countState.local = { num: 5000 };

// Reset the update latency to the workspace default
countState.controls.allowableUpdateLatencyMs = undefined;
```
