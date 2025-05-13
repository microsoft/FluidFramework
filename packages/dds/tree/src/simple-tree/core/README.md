# simple-tree core

Core logic for simple tree.
This is what the rest of simple-tree is build on, and thus to avoid cyclic deps, this should not depend on other parts of simple-tree.

This specifically does not contain any logic specific to field kinds or node kinds (other than the NodeKinds enum definition which is required as part of TreeNodeSchema since the set of NodeKinds is not extensible): everything here should generically apply all of simple-tree's cases.

## Status

More content should be moved into this directory as its disentangled from node kind specific logic.
`proxyBinding.ts` is a good candidate to work toward moving here to.
