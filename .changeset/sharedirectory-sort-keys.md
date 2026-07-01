---
"@fluidframework/map": minor
"fluid-framework": minor
"__section": feature
---

Add opt-in sort-key iteration to SharedDirectory

`SharedDirectory` (and each `IDirectory`) now supports a replicated, opt-in custom iteration order driven by string "sort keys" attached to individual keys and child subdirectories. The default iteration order is unchanged.

#### New API

- `setSortKey(key, sortKey | undefined)` / `setSubDirectorySortKey(name, sortKey | undefined)` — sets (or clears, when passed `undefined`) a sort key.
- `keysByOrder()` / `valuesByOrder()` / `entriesByOrder()` — iterate entries in sort-key order.
- `subdirectoriesByOrder()` — iterate child subdirectories in sort-key order.
- `sortKeyChanged` / `subDirectorySortKeyChanged` on `ISharedDirectory`, plus the path-less `containedSortKeyChanged` / `containedSubDirectorySortKeyChanged` on individual `IDirectory` nodes.

#### Semantics

- Entries with a sort key iterate first, in lexicographic order of the sort key (JavaScript `<`, i.e. UTF-16 code points). Entries without a sort key follow, in the existing iteration order.
- Ties on sort key break by the default iteration order (first-insertion for keys; `seqDataComparator` for subdirectories), so ordering is deterministic across clients.
- Sort keys live alongside the entry they annotate: `delete(k)` clears the entry's sort key, `clear()` clears all sort keys in the directory, and `deleteSubDirectory(name)` clears the subdirectory's sort key on the parent.
- Sort keys replicate via two new op types and round-trip through summaries as additive fields on the snapshot — no format-version bump, and older readers load newer snapshots cleanly (the sort keys are silently dropped).

#### Example

```typescript
import { SharedDirectory } from "fluid-framework";

const dir = SharedDirectory.create(runtime);
dir.set("first", 1);
dir.set("second", 2);
dir.set("third", 3);

// Default iteration reflects insertion order:
[...dir.keys()]; // ["first", "second", "third"]

// Attach sort keys to drive a custom order:
dir.setSortKey("third", "a");
dir.setSortKey("first", "b");
[...dir.keysByOrder()]; // ["third", "first", "second"]
//                         ^ sort-keyed, in lex order
//                                   ^ trailing unkeyed entry in default order
```
