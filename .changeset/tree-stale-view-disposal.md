---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Disposing a stale tree view no longer disrupts its replacement

If you dispose a view, open a replacement on the same live branch, and dispose the old view again, the replacement remains active and editable.
This does not change the rule that a disposed fork cannot be used again.
