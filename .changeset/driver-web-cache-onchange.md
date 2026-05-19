---
"@fluidframework/driver-web-cache": minor
"__section": legacy
---
Add cross-instance change notifications to `FluidCache`

`FluidCache` now broadcasts cache mutations to other `FluidCache` instances in the same browsing context (typically other browser tabs of the same origin) via a `BroadcastChannel`. Consumers can subscribe with the new `onChange` method:

```ts
const unsubscribe = fluidCache.onChange((event) => {
    if (event.op === "removeFile") {
        // All entries for event.fileId were dropped by another tab.
    } else {
        // event.op is "put" or "remove"; event.partitionKey matches this cache's partition.
        // event.fileId, event.type, event.cacheItemId describe the affected entry.
    }
});
// Later:
unsubscribe();
```

Notification semantics:

- `put` and `remove` events are filtered by partition key — a listener only receives events whose `partitionKey` matches the partition key of its `FluidCache`, consistent with the semantics of `get`. The events fire from `put`, a successful `putIf`, and `removeEntry`.
- `removeFile` events fire from `removeEntries` and are delivered to every listener regardless of partition, because `removeEntries` drops rows regardless of partition.
- `BroadcastChannel` does not echo a message back to the instance that posted it, so a write performed by this `FluidCache` does not invoke its own listeners — other instances (including ones in the same tab) do.
- If `BroadcastChannel` is unavailable in the runtime, `onChange` becomes a no-op subscription and writes simply do not broadcast.

The cache now also exposes a `dispose()` method, which closes the `BroadcastChannel`, the open IndexedDB connection, and the close timer. `dispose` is idempotent. Calling `onChange` after `dispose` throws a `UsageError`.
