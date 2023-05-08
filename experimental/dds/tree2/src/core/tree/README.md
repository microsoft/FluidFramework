# tree

Types related to this package's flavor of tree.
This means a tree with typed nodes that have named fields and contain values.

TODO:
The scope of this directory needs some refinement.
Its relation to schema-stored should be clarified (and maybe inverted),
and AnchorSet (at least the implementation logic) should probably move elsewhere.

TODO:
This module having the same name as the package (other than scope/qualification) but meaning something rather different is confusing.
Consider refactoring this module out of existence or renaming it (maybe something like `tree-types`, `tree-nodes` or `typed-tree`.)
Another option is to give a name to this specific tree abstraction (named fields with sequences + values), and use that name for the module:
`flex-tree` has been proposed for a name for this in the past.
