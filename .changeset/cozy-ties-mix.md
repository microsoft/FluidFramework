---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Expose a branch object that is not initially bound to a view

Adds two new @alpha APIs for working with branches as first-class checkouts: getBranch(view) returns the canonical branch-bound TreeBranchAlpha for a given view, and getViewOfBranch(branch, config) produces a TreeViewAlpha over that branch using the supplied TreeViewConfiguration.
Together they allow callers to obtain and view a branch without needing to fork an existing view.
