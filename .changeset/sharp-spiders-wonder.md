---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
"rootChanged" no longer skipped if first change is to undefined

A bug has been fixed where [rootChanged](https://fluidframework.com/docs/api/fluid-framework/treeviewevents-interface#rootchanged-methodsignature) would not be fired if the change is the first change since the [TreeView](https://fluidframework.com/docs/api/fluid-framework/treeview-interface) became in schema, and the change was setting the document root to `undefined`.
