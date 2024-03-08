---
"fluid-framework": minor
"@fluidframework/tree": minor
---

tree: Minor API fixes for "@fluidframework/tree" package.

Rename `IterableTreeListContent` to `IterableTreeArrayContent`, inline `TreeMapNodeBase` into `TreeMapNode`, rename `TreeArrayNode.spread` to `TreeArrayNode.spread` and remove `create` which was not supposed to be public (use `TreeArrayNode.spread` instead).
