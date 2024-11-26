---
"@fluidframework/presence": minor
---
---
"section": feature
---

Presence signals are now batched and throttled

Presence signals are batched together and throttled to prevent flooding the network with signals when presence values are rapidly updated.
The presence infrastructure will not immediately send outgoing signals; rather, they will be batched with any other outgoing signals and queued until a later time.

A presence value manager such as `LatestValueManager` has an `allowableUpdateLatencyMs` value that can be configured; this value controls the longest time a signal will be queued.
This value can be controlled dynamically at runtime, so adjustments can be made based on runtime data.

The default `allowableUpdateLatencyMs` is **60 milliseconds**.

Note that a signal may be sent before the allowable latency if another signal is sent. Signals are combined as needed and sent immediately at the earliest deadline.

Notifications workspaces' signals are not queued; they effectively always have an `allowableUpdateLatencyMs` of 0. However, they may be batched with other signals that were queued earlier.

The details of how signals are batched together is typically irrelevant to users of the Presence APIs, because the relevant value managers and the presence manager deal with these complexities.

#### Example

You can configure the batching and throttling behavior using the `allowableUpdateLatencyMs` property as in the following example:

```ts
// Configure a state workspace
const stateWorkspace = presence.getStates("name:testStateWorkspace", {
	// This value manager has an allowable latency of 100ms, overriding the default value of 60ms.
	count: Latest({ num: 0 }, { allowableUpdateLatencyMs: 100 }),
});
```
