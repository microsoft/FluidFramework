---
"fluid-framework": minor
"@fluidframework/tree": minor
---
---
"section": tree
---

`TreeNodeSchemaClass` now specifies its `TNode` as `TreeNode`

`TreeNodeSchemaClass`'s `TNode` parameter used to be `unknown` and was recently improved to be the more specific `TreeNode | TreeLeafValue`.
This change further narrows this to `TreeNode`.

`TreeNodeSchema`, which is more commonly used, still permits `TNode` of `TreeNode | TreeLeafValue`, so this change should have little impact on most code, but in some edge cases it can result in slightly more specific typing.
