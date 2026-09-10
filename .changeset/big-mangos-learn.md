---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---

Fix reverting multi-commit sequence changes

Reverting a revision with `TreeViewAlpha.revertTo()` now allocates distinct identifiers when undoing array edits from multiple commits.
This prevents identifier collisions during reversion and subsequent undo or redo, including histories with concurrent moves and nested edits.
Inversion also handles moves fragmented by many concurrent insertions without recursive stack growth.
Rollback behavior and the stored change format are unchanged.
