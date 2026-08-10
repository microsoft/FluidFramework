---
"@fluidframework/tree": minor
"@fluidframework/react": minor
"fluid-framework": minor
"__section": tree
---

Plain text selection tracking now uses insertion anchors

`PlainText.Tree` now exposes `createInsertionAnchor`, which tracks a character insertion point across edits using the underlying array node anchor.

`useTreeSynchronizedString` now returns `setSelection`, allowing text editors to seed and update the selection range tracked by those anchors. The plain text React editor uses this API to preserve textarea selections across collaborative edits without duplicating per-delta cursor adjustment logic.
