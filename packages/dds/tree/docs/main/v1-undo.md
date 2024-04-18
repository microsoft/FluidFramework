# V1 Undo

Here we detail the vision for the first implementation of undo/redo.
This implementation is meant to satisfy our needs for parity with experimental (AKA legacy) SharedTree.

Note that the system described here allows for a change to a subtree that was concurrently removed to have an impact on that subtree,
even when the deletion is sequenced before the subtree-impacting change.
This system does not, however, support the editing of any subtree that is in a removed state in the context where such an edit would be made.

## Unifying Undo and Redo

### Creating Concrete Undo Edits

This first version aims to achieve some basic undo functionality with a minimum amount of code changes and complexity.
To that end, we reuse the existing code paths for changesets by always sending
[concrete undos](./undo.md#abstract-vs-concrete-undo-messages) over the wire.
The undo edit is created by inverting the edit that needs to be undone,
and rebasing that inverse over all the changes that have been applied since.

Sending concrete undo edits alleviates the need to establish and maintain distributed consensus on an undo window.
It does however require sending rebased changes over the wire
(although that is also needed for resubmitting ops, so concrete undo does not make this a new requirement).

### Creating Concrete Redo Edits

Redo changesets are created by inverting the corresponding undo changeset and rebasing that inverse over all the edits that were applied since the undo.
This is preferable to rebasing the original (undone) edit over all the edits that were applied since that original edit for the following reasons:

-   It is better at mitigating data-loss caused by undo.
    For example, undoing an insert will remove any content that has since been added under the inserted node.
    Applying the inverse of the undo will restore that content while re-applying the original insert will not.
-   It is more efficient as it doesn't require rebasing over as many edits (and retaining as many edits).

### Revertibles

This approach to undo and redo makes the two cases indistinguishable for our implementation.
Instead of undoing or redoing an edit, we simply speak of reverting and edit.
Each edit is represented by commit.
For each edit that can be reverted, a `Revertible` object can be generated and used to revert it.
For practical details, see the `CheckoutEvents.commitApplied` and `Revertible` APIs.

## Managing Revertibles

In order to revert a commit, we must invert it and rebase that invert to the tip of the branch on which the revert would apply.
This requires:

-   The original commit to be reverted
-   The commits that we applied after the original commit

So long as a commit may be reverted, this information is maintained by maintaining a branch whose tip is the original commit.
If and when the commit is reverted, the inverse of the commit is rebased from the tip of that branch to the tip of the branch on which the inverse will apply.
The inverse is then applied to the tip of that branch.
This approach imbues reverts with the specific semantics described here. TODO: link doc.

Note that this approach relies on the fact that, at a low level, SharedTree edits are non-destructive,
meaning they do not erase information about the document.
For more details, see [Detached Tree](./repair-data.md).

When the `Revertible` object associated with the revertible commit is disposed,
the associated branch is disposed and any associated resources are reclaimed.
