---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Hoist runTransaction method from TreeViewAlpha to TreeBranch

Transactions are not view-schema-dependent, so it isn't necessary for them to be exclusive to the view type.
`runTransaction` is now available on `TreeBranch` (alpha).
`TreeViewAlpha` extends `TreeBranch`, so this change strictly makes the API more accessible.
