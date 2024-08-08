# simple-tree core

Core logic for simple tree.
This is what the rest of simple-tree is build on, and thus to avoid cyclic deps, this should not depend on other parts of simple-tree.

This specifically does not contain any logic specific fo node kinds or field kinds: everything here should generically apply all of simple-tree's cases.

## Status

Currently this has some type dependencies on the rest of simple-tree, but not runtime dependencies.
This is not ideal, and reducing these is a work in progress.