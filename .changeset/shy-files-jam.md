---
"@fluidframework/presence": minor
---
---
"section": feature
---

Presence signals are now batched and throttled

Presence signals are batched together and throttled to prevent flooding the network with signals when presence values are rapidly updated.
The presence infrastructure will not immediately send outgoing signals; rather, they will be batched with any other outgoing messages and queued until a later time.

A presence value manager such as `LatestValueManager` has an `allowableUpdateLatencyMs` value that can be configured; this value controls the longest time a message will be queued.
This value can be controlled dynamically at runtime, so adjustments can be made based on runtime data.

The default `allowableUpdateLatencyMs` is **60 milliseconds**.

#### Example

You can configure the batching and throttling behavior using the `allowableUpdateLatencyMs` property as in the following example:

```ts
// Configure a state workspace
const stateWorkspace = presence.getStates("name:testStateWorkspace", {
	// This value manager has an allowable latency of 100ms, overriding the default value of 60ms.
	count: Latest({ num: 0 }, { allowableUpdateLatencyMs: 100 }),
});
```
