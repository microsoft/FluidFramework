---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Text nodes can now track insertion positions across edits

`PlainText` and `FormattedText` nodes now provide `createInsertionAnchor`, which returns an `ArrayPlaceAnchor` whose character index updates as the text is edited. Dispose the anchor when it is no longer needed.
