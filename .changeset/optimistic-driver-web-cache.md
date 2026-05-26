---
"@fluidframework/driver-web-cache": minor
"__section": legacy
---
Add `FluidCache.update` for atomic read-modify-write

`FluidCache` now exposes `update(entry, updater)`, which performs an atomic read-modify-write on a cached entry.
The currently-cached value is read and the updater callback decides whether — and what — to write, inside a single IndexedDB `readwrite` transaction.
This gives consistent update semantics across consumers sharing the same underlying IndexedDB instance (for example, multiple browser tabs racing to persist offline pending state).

```ts
// Conditional overwrite (active tab wins): only write if our revision is higher.
const wrote = await fluidCache.update(entry, (existing, set) => {
    const existingRev = (existing as { rev?: number } | undefined)?.rev ?? -1;
    if (mine.rev > existingRev) {
        set(mine);
    }
});

// Read-modify-write: increment a counter atomically.
await fluidCache.update(entry, (existing, set) => {
    const prev = (existing as { count: number } | undefined)?.count ?? 0;
    set({ count: prev + 1 });
});
```

The updater callback is invoked with `(existing, set)`.
`existing` is `undefined` in any case where the row would not be visible to `get`: no entry exists for the key, the existing entry belongs to a different partition, or the existing entry is older than `maxCacheItemAge`.
To commit a write, call `set(value)`; to leave the cache untouched, return without calling `set`.

Calling `set(undefined)` removes the row at the key, equivalent to `removeEntry` inside the same atomic transaction.
`get` already collapses "no entry" and "entry stored as undefined" into the same observable result, so the delete-on-undefined semantics gives callers an atomic conditional-delete.

Both the updater body and the `set` call must run synchronously.
IndexedDB transactions close automatically on any non-IndexedDB await, which would break the atomicity that makes the update correct.
Calling `set` after the updater has returned throws a `UsageError` so that misuse is visible rather than silently lost.
If the updater calls `set` more than once, the last value wins.
If the updater throws — including after calling `set` — the transaction is aborted and the existing row is preserved.

When `set` is called, the write (or delete) proceeds and atomically replaces whatever row exists at the key, including cross-partition or stale rows the updater saw as `undefined`.
This matches the unconditional overwrite behavior of `put`.
`update` returns `true` if `set` was called and the write (or delete) committed, and `false` if the updater returned without calling `set`, threw, or an IDB error occurred.
Errors are logged and not thrown, matching `put`.
