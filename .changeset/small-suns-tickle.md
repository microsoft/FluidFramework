---
"@fluidframework/react": minor
"__section": feature
---
Collaborative text editors can track selections across edits

[useTreeSynchronizedString](https://fluidframework.com/docs/api/react#usetreesynchronizedstring-function) now returns [SynchronizedString.setSelection](https://fluidframework.com/docs/api/react/synchronizedstring-interface#setselection-propertysignature), allowing text editors to seed and update the selection range tracked by those anchors. The plain text React editor uses this API to preserve textarea selections across collaborative edits without duplicating per-delta cursor adjustment logic.
