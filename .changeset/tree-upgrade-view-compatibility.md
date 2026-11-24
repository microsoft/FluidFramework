---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
SharedTree applies schema upgrades needed to make a view usable

`view.upgradeSchema()` no longer skips a required schema change just because the old and new stored schemas permit the same documents.
For example, a view may need a new field definition on a node that cannot yet occur because its required content is staged but disabled.
Applying the upgrade makes the root accessible without changing its content.
