---
"@fluidframework/map": minor
"__section": feature
---
Add IDirectory.createSubDirectoryOrderedAfter

`SharedDirectory` iterates its subdirectories in the order they were created, which has historically made `createSubDirectory` behave like an append. Callers who needed to insert a subdirectory at a specific position within the existing order had to delete everything after the target position, insert, then re-create the deleted subdirectories — a costly workaround.

`IDirectory` now exposes `createSubDirectoryOrderedAfter(newSubdirName, afterSubdirName)`, which creates a subdirectory and requests that it be ordered immediately after the named existing sibling. The ordering hint is best-effort and is resolved at stamp time: if the named anchor does not exist at stamp time (never created, concurrently deleted, or not yet sequenced), the new subdirectory is appended at the end, matching `createSubDirectory`'s behavior. The hint establishes no long-term relationship with the anchor, and is compatible with the existing same-name concurrent-create merge semantics.

```ts
directory.createSubDirectory("a");
directory.createSubDirectory("b");
directory.createSubDirectoryOrderedAfter("c", "a");
// iteration order: a, c, b
```

Older clients in the same session that do not understand the ordering hint will treat these insertions as plain appends. The hint is observed only among clients on this version or later.
