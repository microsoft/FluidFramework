---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---

History compaction API contract is available (not yet implemented)

A new alpha API contract for application-driven history compaction is now exported from `@fluidframework/tree/alpha` and `fluid-framework/alpha`: `TreeHistoryCompaction`, `CanCompactCommit`, `CompactionResult`, and `RevisionPreservationResult`, accessible via the new `historyCompaction` property on `TreeView`.

Applications will be able to call `historyCompaction.requestCompaction(canCompactCommit)` to let SharedTree merge eligible adjacent commit boundaries using an app-supplied content-based policy, and `historyCompaction.setRevisionPreserved(revision, isPreserved)` to pin specific revisions against compaction.

This change introduces only the type contract and stubbed accessors; both methods currently throw `UsageError` until the underlying compaction engine is implemented.
