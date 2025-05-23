---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Fix Tree.key and Tree.parent for Unhydrated nodes after edits

In some cases, editing [Unhydrated](https://fluidframework.com/docs/api/fluid-framework/unhydrated-typealias) nodes could result in incorrect results being returned from [Tree.key](https://fluidframework.com/docs/data-structures/tree/nodes#treekey) and [Tree.parent](https://fluidframework.com/docs/data-structures/tree/nodes#treeparent).
This has been fixed.
