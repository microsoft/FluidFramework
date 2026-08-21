---
"@fluidframework/tree": minor
"@fluidframework/react": minor
"fluid-framework": minor
"__section": tree
---
Plain and formatted text APIs now support insertion anchors

The [`PlainText`](https://fluidframework.com/docs/api/tree#plaintext-namespace) and [`FormattedText`](https://fluidframework.com/docs/api/tree#formattedtext-namespace) APIs now expose `createInsertionAnchor`, which tracks a character insertion point across edits using the underlying array node anchor.

[`useTreeSynchronizedString`](https://fluidframework.com/docs/api/react#usetreesynchronizedstring-function) now returns [`SynchronizedString.setSelection`](https://fluidframework.com/docs/api/react/synchronizedstring-interface#setselection-propertysignature), allowing text editors to seed and update the selection range tracked by those anchors. The plain text React editor uses this API to preserve textarea selections across collaborative edits without duplicating per-delta cursor adjustment logic.
