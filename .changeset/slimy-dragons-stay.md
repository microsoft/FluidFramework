---
"fluid-framework": minor
"@fluidframework/tree": minor
---

Minor API fixes for "@fluidframework/tree" package.

Rename `IterableTreeListContent` to `IterableTreeArrayContent`, inline `TreeMapNodeBase` into `TreeMapNode` and remove `create` which was not supposed to be public (use `TreeArrayNode.inline` instead).
