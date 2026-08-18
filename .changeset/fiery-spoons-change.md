---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Bug fix: forking during changed event callback is now safe

[Forking](https://fluidframework.com/docs/api/fluid-framework/treeviewbeta-interface#fork-methodsignature) (beta) a view during the callback for the ["changed" event](https://fluidframework.com/docs/api/fluid-framework/treebranchevents-interface#changed-methodsignature) (alpha) emitted when a transaction is committed would create a fork with malformed change data.
This could result in asserts being triggered when utilizing the fork (including, but not limited to error code `0x7ce`).
