---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": fix
---
Reject reverts across schema changes

[`UntypedTreeViewAlpha.revertTo()`](https://fluidframework.com/docs/api/tree/untypedtreeviewalpha-interface#revertto-methodsignature) now throws a usage error if any commit being reverted contains a schema change.
The operation leaves the document unchanged, preserving transaction atomicity for commits that contain both schema and data changes.
You can still revert data changes made after a schema upgrade by targeting the revision of that upgrade or a later revision.
