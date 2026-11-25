---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
SharedTree applies schema upgrades needed to make a view usable

Previously, `view.upgradeSchema()` could return successfully while `view.compatibility.canView` remained `false`.
It now applies the permitted schema change needed to make the view usable.
