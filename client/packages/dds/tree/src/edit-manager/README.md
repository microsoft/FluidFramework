# edit-manager

This modules handles Fluid's approach to sequenced vs local edits.
It uses reference sequence numbers to construct the tree of branches capturing each clients observed stated when Ops were sent.
Generic over the [`change-family`](../change-family/README.md).

TODO:
Should be a wrapper on top of [`rebaser`](../rebase/README.md).
Also since this modules is only a single file and does not have extra dependencies beyond `rebaser`,
it could be merged into `rebaser`, or its consumer (`shared-tree-core`)
to keep the top level module count down.
Another option would be to turn `rebaser` into just an interface project (used by change rebaser implementations),
and move the actual `Rebaser` implementation here to reduce dependencies of change rebasers.
