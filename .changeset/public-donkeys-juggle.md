---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": fix
---
Allow edits in arrays and sequences to be concurrent to dependent edits of transactions with violated constraints

Before this release, making concurrent edits to an array or a sequence could lead to a firing of assert `0x8a2` if the following conditions were met:
* Some edit `e1` was a transaction with a constraint that turned out to be violated by edits concurrent to (and sequenced before) `e1`
* Some edit `e2` was dependent on `e1` (from before the violation of its constraint)
* Some edit `e3` was concurrent to and sequenced after both `e1` and `e2`
* `e3` was either concurrent to or the revert of some other edit `e0` that predated `e1`, `e2`, and `e3`.
* `e0` and `e2` made edits to the same gap (that is, in the same space between nodes) in the sequence/array.

After this release, these scenarios will work as expected (that is, no assert).
