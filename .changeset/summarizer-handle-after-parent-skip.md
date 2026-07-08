---
"@fluidframework/container-runtime": minor
"__section": fix
---
Fix summarizer emitting invalid nested handles after a parent skipped recursion

Fixes a bug where a `SummarizerNode` could emit a `SummaryType.Handle` for a child even though the child's content was not directly present in the referenced summary version. This happened when the child's parent had previously emitted a handle (skipped recursion), causing the child's content to only be transitively reachable through the parent's handle chain. On subsequent summaries, if the parent became dirty and re-summarized while the child had not changed, the child would emit a handle pointing to a version where its path could not be resolved by the storage service, producing errors like:

```
ODSP fetch error [404] ... fluidElementNotFound
Cannot locate node with path '.app/.channels/<dataStore>/.channels/root' under '<snapshotId>'
```

This surfaced most visibly on SharedTree, whose incremental summary builder emits many nested chunk-level handles, but the underlying issue affected any DDS relying on nested handle reuse across summaries.

The fix ensures that when a parent node skips recursion, all of its descendants clear their tracked reference sequence number so they will re-emit a full summary tree next time, rather than an unresolvable handle.
