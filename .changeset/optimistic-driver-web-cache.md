---
"@fluidframework/driver-web-cache": minor
"__section": legacy
---
Add `FluidCache.putIf` for compare-and-swap writes

`FluidCache` now exposes `putIf(entry, value, shouldWrite)`, a conditional variant of `put` that lets the caller decide — based on what is currently cached — whether the new value should overwrite the existing one. The read of the existing entry and the conditional write happen in a single IndexedDB `readwrite` transaction, providing compare-and-swap semantics across consumers sharing the same underlying IndexedDB instance (e.g. multiple browser tabs racing to persist offline pending state).

```ts
const wrote = await fluidCache.putIf(entry, proposed, (existing, prop) => {
    // existing is undefined if no entry exists for this key in this partition.
    const existingRev = (existing as { rev?: number } | undefined)?.rev ?? -1;
    return (prop as { rev: number }).rev > existingRev;
});
```

The `shouldWrite` predicate must be synchronous: IndexedDB transactions auto-close on any non-IDB await, which would silently break the atomicity that makes the compare-and-swap correct. The predicate is invoked with `(existing, proposed)`, where `existing` is `undefined` when no entry exists for the key or when the existing entry belongs to a different partition (consistent with the semantics of `get`). The call returns `true` if the new value was written and `false` if the predicate rejected the write or an error occurred (errors are logged and not thrown, matching `put`).
