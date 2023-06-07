# V1 Undo

Here we detail the vision for the first implementation of undo/redo.
This implementation is meant to satisfy our needs for parity with experimental (AKA legacy) SharedTree.

Note that the system described here allows for changes to subtrees that were concurrently deleted to have an impact on that subtree,
even when the deletion is sequenced before the subtree-impacting change.
This system does not, however support editing of subtrees that were deleted prior,
though the system may be extended to do so.

Related:

-   [V1 Undo Example Flow](./v1-undo-example-flow.md)

This first version aims to achieve some basic undo functionality with a minimum amount of code changes and complexity.
To that end, we mostly reuse the existing code paths for changesets by always sending
[concrete undos](./README.md#abstract-vs-concrete-undo-messages) over the wire.
The undo edit is created by inverting the edit that needs to be undone,
and rebasing that inverse over all the changes that have been applied since.

Sending concrete undo edits alleviates the need to establish and maintain distributed consensus on an undo window.
It does however require sending rebased changes over the wire
(although that is also needed for resubmitting ops, so concrete undo does not make this a new requirement).
Rebased changes may contain lineage entries, which we haven't sent over the wire before.
We do not currently know of a reason why this would be problematic,
or of any other issue or special requirement associated with sending rebased changes over the wire.

Using concrete undos even when the change to be undone has not been sequenced is somewhat problematic
because we cannot know in advance the exact impact of the change to undo.
Despite that, we anticipate no data loss and no decoherence from it.

### Creating Concrete Redo Edits

Redo changesets should be created by inverting the corresponding undo changeset and rebasing that inverse over all the edits that were applied since the undo.
This is preferable to rebasing the original edit over all the edits that were applied since before the original edit:

-   It is better at mitigating data-loss caused by undo.
    For example, undoing an insert will delete any content that has since been added under the inserted node.
    Applying the inverse of the undo will restore that content while re-applying the original insert will not.
-   It is more efficient as it doesn't require rebasing over as many edits.

## The Undo Commit Tree

In order to perform an undo operation, it is necessary that we are able to determine which prior edit is to be undone.
To that end, we need to maintain a tree of undoable commits where each node may look like this:

```typescript
interface UndoableCommit<TChange> {
	/* The commit to undo */
	readonly commit: GraphCommit<TChange>;
	/* The next undoable commit. */
	readonly parent?: UndoableCommit<TChange>;
}
```

That tree is a sparse copy of the commit tree maintained by `EditManager` and `SharedTreeBranch`es for branch management.

The structure forms a tree as opposed to a linked-list because different local branches can share the same ancestor commits.
Each branch however only ever sees a single spine of this tree, which therefore looks like a linked-list to said branch.
The rest of the document uses the term "list" when describing operations performed at the scope of a single branch.

The tree is sparse because it does **_not_** contain the following kinds of edits:

-   Edits authored by other clients (this is only a concern for the part of the tree that represents the trunk).
-   Undo edits.

Note that some of these edits in the tree may be part of the trunk while others may be on a branch.
Each branch need only maintain a "head" pointer to the child-most commit on the branch.

## The Redo Commit Tree

The tree of redoable commits is maintained across branches in a similar fashion to the undoable commits tree.
Redoable commits are effectively undoable commits and can therefore use the same `UndoableCommit` structure described above.

## Reacting to Local Edits

The redo and undo commit lists for a branch are updated as follows in the face of new local edits:

-   If the edit is neither an undo nor a redo:
    -   A new undoable commit node is pushed onto the undoable commit list.
        The parent field of the new commit node should point to the previous head undoable commit.
    -   The head pointer for the redoable commits is cleared for that branch.
        This effectively drops all the redoable commits for the branch.
-   If the edit is an undo:
    -   The head undoable commit is popped.
        The parent of the undoable commit becomes the new head undoable commit.
    -   The concrete undo commit is pushed onto the tip of the redoable commit list.
        The parent field of the new redoable commit node should point to the previous head redoable commit.
-   If the edit is a redo:
    -   The head pointer for the redoable commits is popped.
        The parent of the redoable commit becomes the new head redoable commit.
    -   The concrete redo commit is pushed onto the undoable commit list.
        The parent field of the new commit node should point to the previous head undoable commit.

## Forking

When a branch is forked, the new branch can simply obtain the head undoable and redoable commit pointers from the parent branch.
This helps keep forking cheap.

## Rebasing

When a branch is rebased onto another branch, it must re-create whatever undoable and redoable commits it has to the head of the undo list maintained by the parent branch.
This can be done by finding the lowest common ancestor in between the two branches,
and attaching to the tip of the parent branch all of the commits on the child branch that lie under the common ancestor.

Note that all the commits from the rebased branch will undergo rebasing so the undoable/redoable commit nodes for them will need to be remade.
It would not be valid to simply update the rebased branch's existing undo commit node objects by updating the edits within.
That's because it's possible that the rebased branch may itself be the parent branch of some other child branch,
whose undo queue includes those commit nodes.
The child-most branch's commit nodes should not be affected by the fact that its parent branch was rebased.

One simple way to characterize what needs to happen
(and possibly to implement it)
is to replay (the rebased version of) the local branch edits onto a new fork of the parent branch.
This would however require knowing which of those local edits were undo, redos, or normal edits.

## Dropping Old Commits

As sequenced edits fall out of the collab window,
we have the option to either drop or retain the corresponding commit nodes in the undo tree.
We can let the application pick a maximum length for the undo queue of the user.

Retaining commits that fall out of the collab window muddies the statement that this commit tree is a sparse version of the normal commit tree.
It can be still be thought of as sparse if we ignore the fact that sequenced commits get dropped from it as the collab window advances.

## Repair Data

Repair data is needed in the following cases:

-   Creating an undo (or redo) edit for a local branch.
-   Applying an undo (or redo) edit from the local branch.
-   Applying an undo (or redo) edit from a peer.
-   Applying the effect of a move (peer or local) that pulls a subtree out from deleted content and moves into the document tree.
-   Applying the effect of rebasing local destructive changes (i.e., overwrites and deletions) that were predicated on a constraint that was violated as part of the rebase.

Note that,
while these are the only cases where we need to know what the repair data is,
they require that the repair data be kept up to date,
which then forces to consider cases where the repair data is not needed but is edited.
This can happen when a client edits a region of the document tree while that region is concurrently deleted by another client.

### The Stygian Forest

(Stygian)[https://www.merriam-webster.com/dictionary/stygian],
is used here to mean (Styx)[https://en.wikipedia.org/wiki/Styx]-like in its ability to span the realms of undeleted (living) content and deleted (dead) content,
and ferry data across it.

The responsibility of a `StygianForest` is to maintain,
in addition to the undeleted document data,
the repair data that may be needed handle the cases listed above.

This coupling of repair data with the in-document data is motivated by the following points:

-   Aside from some a pair of performance-motivated exceptions (covered below) the repair data is solely relevant to applying changes.
-   The needs of repair data storage, reading, and editing, are identical to that of in-document data.
-   Storing both in the same forest makes it easy, when it is appealing to do so,
    to efficiently remove/restore deleted content because it saves us from having to export/import it from and to the forest.

The alternative, coupling repair data with the changesets that birthed them, is undesirable for the following reasons:

-   While, once rebased, a changeset is fixed, the repair data that this changeset produces may change.
-   Several components/layers of the `SharedTree` system deal with changesets, not all of them need to care about repair data.
-   Decoupling repair data from changesets frees the rebasing system from having to plumb through a repair data querying interface,
    making it more self-contained and therefor easier to implement and test.
    This is made possible by the fact that repair data is **not** required for the purpose of rebasing changesets.

#### Implementation

Each `StygianForest` wraps a "normal" forest (henceforth referred to as the "inner forest").
This enables the `StygianForest` to leverage the capabilities of the forest (i.e., storage, reading, and editing) for the purpose of managing repair data.
In effect, the `StygianForest` meets the more advanced requirements of our repair data system
(understanding the difference between normal document data vs. repair data, and supporting the more complex lifecycle of the latter)
by appropriately driving the forest it wraps.
This allows us to cleanly separate the concerns of locally storing, reading, and editing tree data on one side
from the the concerns of repair data on the other.

This approach to dealing with repair data requires that the `StygianForest` be able to maintain a correspondence between
how changesets refer to deleted/overwritten content
and how the inner forest refers to this same content.

### Creating Repair Data On Change Application

There are two cases that can lead to the destruction of document data:

-   When a subtree is deleted
-   When the value on an node is overwritten

When a `Delta` is applied to the `StygianForest`,
for every change conveyed by the `Delta` that would destroy document data,
the `StygianForest` must do the following:

-   Translate that change into an equivalent change that preserves the otherwise destroyed data
    (i.e., the deleted subtree or overwritten value)
    by moving or copying it in a part of the inner forest that lies outside the scope of the document.
-   Apply that change to the inner forest.
-   Keep a record of where that particular piece of repair data is stored in the inner forest.

### Consuming Repair Data On Change Application

There are three cases that can lead the consumption of repair data:

-   When a subtree's deletion is inverted
-   When the overwrite of node's value is inverted
-   When a deleted node is resurrected by a move that was concurrent to, but sequenced after, the deletion,
    and that move's destination lies within the document tree.
    (This last scenario is not yet supported and is subject to debate.)

When a `Delta` is applied to the `StygianForest`,
for every change conveyed by the `Delta` that consumes repair data,
the `StygianForest` must do the following:

-   Lookup in its records where the relevant piece of repair data is stored in the inner forest.
-   Translate the change into an equivalent change that either
    -   moves the repair data to the document tree.
    -   copies the repair data to the document tree and deletes the original.
-   Apply that change to the inner forest.
-   Remove the entry in its records for where the relevant piece of repair data was located in the inner forest.

### Editing Repair Data On Change Application

It is possible for repair data to be edited by edits that were authored concurrently to the edit that lead to the creation of that repair data.
Note that this includes cases where:

-   The edit is contained within a single deleted subtree
-   The edit spans a pair of deleted subtrees
-   The edit spans a deleted subtree and the document tree

When a `Delta` is applied to the `StygianForest`,
for every change conveyed by the `Delta` that edits repair data,
the `StygianForest` must do the following:

-   Lookup in its records where the relevant piece of repair data is stored in the inner forest.
-   Translate the change into an equivalent change that applies to the repair data tree in the inner forest.
-   Apply that change to the inner forest.

### Patching Repair Data After Transactions

`SharedTreeView` supports transactions by following a two-stage process:

1. After a transaction is started, and for the duration of the transaction, all edits that make up the transaction are treated as individual commits.
2. When the transaction is terminated, the view's `SharedTreeBranch` and its other components (e.g., the forest) are updated to match the outcome of the transaction:
    - If the transaction was aborted, then the commits from the transaction are removed from the branch and the changes are reverted from the forest.
    - If the transaction was committed, then the commits from the transaction are composed into a single commit, and the forest is left untouched.

In the abort case, the `StygianForest` will be correctly updated through the application of the inverses of the transaction's commits.
In the commit case however,
the `StygianForest` needs to be patched to account for the fact that any repair data generated by the transaction's individual commits will should now be attributed to the one composed commit that makes up the whole transaction.

We currently plan to address this need using the following implementation strategy:

-   As changes are being made during the transaction,
    assign each transaction change
    (among the kind of changes that is liable to produce repair data)
    a changeset-local ID that is unique across the whole transaction.
    (At the time of writing, we already avoid recycling changeset-local ID among the changesets that make up a transaction.)
-   When the `StygianForest` is informed of such a change, it stores the repair data for it as normal.
-   When the transaction is completed,
    for each piece of repair data associated with changesets that make up the transaction,
    keep the repair data in the `StygianForest` but update its entry so that it is now associated with the composed changeset.

The above approach relies on the fact that composition can elide but not reassign changeset-local IDs.
This avoids the problem of having to reverse-engineer how the repair data produced by the individual changesets maps to the repair data produced by composed changeset.

Note that this require reassigning new changeset-local IDs to changeset that are merged into the branch whose transaction is open.

### Patching Repair Data After Rebasing

When a `SharedTreeBranch` is rebased,
any owning `SharedTreeView` may have to be updated to reflect the changes performed by the concurrent changes on which the branch was rebased,
as well as the knock-on effects of those changes on the changes that were on the rebased branch.
Updating the `SharedTreeView` includes updating the `StygianForest` it carries with it.

Our existing approach to updating the forest is to compose an "update" changeset that is a composition of the following changesets:

1. The inverse of each changeset (in reverse order) on the branch that is being rebased
2. The concurrent changesets being rebased over
3. The rebased version each changeset on the branch that is being rebased

The benefit of composing these changesets together is that it may produce a small changeset, whose impact on the `SharedTreeView` is minimal.
This is in contrast to actually applying these changesets individually,
where the changesets from the third group may largely cancel-out with the changesets from the first group,
leading to unnecessary state churning and invalidation of downstream components.

Another approach that could be taken, would be to clone the `SharedTreeView` components
(such as `StygianForest` and the `AnchorSet`)
of the branch onto which the current `SharedTreeView` is being rebased,
and apply the rebased edits to that clone.
The drawback of that approach is that this not only may cause invalidation in parts of the documents that are not actually changed by the rebase,
but it also forces all consumers of these components to update/rebuild any references that might have had (such as anchors) to those components.

The upshot is that `StygianForest` must tolerate the kind of changesets that results from such rebase operations.

### Repair Data In Summaries

### Garbage-Collecting Repair Data

### Querying Repair Data For Undo

This is only needed because we need to remind peers of what the data is.
The data is not removed from the `StygianForest`.

### Performance Improvements

#### No Repair Data On Undo of Unsequenced Edits

Don't include repair data (i.e., overwritten values or removed nodes) when sending an undo for a change that has not yet been sequenced.
This is safe because, so long that the undo is within the collab window when sequenced, the original change is guaranteed to still be in the collab window as well.
This means the peers are guaranteed to still have the repair data for it in memory.
If the undo is were to fall outside the collab window when sequenced, then it simply would be ignored.

## Supporting Edits To Deleted Content
