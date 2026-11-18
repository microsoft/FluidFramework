---
"@fluidframework/tree": minor
"__section": tree
"__includeInReleaseNotes": false
---

Add opt-in diagnostics for history retention and compaction

For app testing, enable `Fluid.SharedTree.HistoryDebugTrace` through the loader's configuration provider and use a verbose-capable Fluid logger.
Diagnostic events report retention bounds, compaction plans, skipped ranges, and completed merges, revision preservation, and summary/load activity.
Tracing is disabled by default and does not change the public API or persisted formats.
