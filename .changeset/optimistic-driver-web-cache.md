---
"@fluidframework/driver-web-cache": minor
"__section": legacy
---
Add `FluidCache.putIf` for compare-and-swap writes

`FluidCache` now exposes `putIf(entry, value, shouldWrite)`, a conditional variant of `put`.
The caller decides, based on what is currently cached, whether the new value should overwrite the existing one.
The read of the existing entry and the conditional write happen in a single IndexedDB `readwrite` transaction.
This provides compare-and-swap semantics across consumers sharing the same underlying IndexedDB instance (for example, multiple browser tabs racing to persist offline pending state).

```ts
const wrote = await fluidCache.putIf(entry, proposed, (existing, prop) => {
    // existing is undefined if no entry exists for this key in this partition.
    const existingRev = (existing as { rev?: number } | undefined)?.rev ?? -1;
    return (prop as { rev: number }).rev > existingRev;
});
```

The `shouldWrite` predicate must be synchronous.
IndexedDB transactions close automatically on any non-IndexedDB await, which would break the atomicity that makes the compare-and-swap correct.
The predicate is invoked with `(existing, proposed)`.
`existing` is `undefined` in any case where the row would not be visible to `get`: no entry exists for the key, the existing entry belongs to a different partition, or the existing entry is older than `maxCacheItemAge`.
The call returns `true` if the new value was written and `false` if the predicate rejected the write or an error occurred.
Errors are logged and not thrown, matching `put`.
When the predicate returns `true`, the write proceeds and atomically replaces whatever row exists at the key, including cross-partition or stale rows that the predicate saw as `undefined`.
This matches the unconditional overwrite behavior of `put`.
