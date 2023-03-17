# V1 Undo

Here we detail the vision for the first implementation of undo/redo.
This implementation is meant to satisfy our needs for parity with experimental (AKA legacy) SharedTree.

Related:

-   [V1 Undo Example Flow](./v1-undo-example-flow.md)

This first version aims to achieve some basic undo functionality with a minimum amount of code changes and complexity.
To that end, we mostly reuse the existing code paths for changesets by always sending
[concrete undos](./README.md#abstract-vs-concrete-undo-messages) over the wire.
The undo edit is created by inverting the edit that needs to be undone,
and rebasing that inverse over all the changes that have been applied since.

Sending concrete undo edits alleviates the need to establish and maintain distributed consensus on an undo window.It also means summaries do not need to include repair data.
It does however require sending rebased changes over the wire
(although that is also needed for resubmitting ops, so concrete undo does not make this a new requirement).
Rebased changes may contain lineage entries, which we haven't sent over the wire before.
We do not currently know of a reason why this would be problematic,
or of any other issue or special requirement associated with sending rebased changes over the wire.

Using concrete undos even when the change to be undone has not been sequenced is somewhat problematic
because we cannot know in advance the exact impact of the change to undo.

For this V1, we simply produce a "best attempt" undo based on the most up to date version of the change to be undone.
This could lead to some data loss in scenarios where the change to be undone deletes a subtree under which content is concurrently inserted.

### Creating Concrete Redo Edits

Redo changesets should be created by inverting the corresponding undo changeset and rebasing that inverse over all the edits that were applied since the undo.This is preferable to rebasing the original edit over all the edits that were applied since before the original edit:

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
	/* The repair data associated with the commit */
	readonly repairData: ReadonlyRepairDataStore;
	/* The next undoable commit. */
	readonly parent?: UndoableCommit<TChange>;
}
```

That tree is a sparse copy of the commit tree maintained by `EditManager` and `Checkout`s for branch management.

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

## Pulling

When a branch is pulled, it must re-attach whatever undoable and redoable commits it has to the head of the undo list maintained by the parent branch.
This can be done by finding the lowest common ancestor in between the two branches,
and attaching to the tip of the parent branch all of the commits on the child branch that lie under the common ancestor.

Note that all the commits from the child branch will undergo rebasing so the undoable/redoable commit nodes for them will need to be remade.
It would not be valid to simply update the existing child branch's undo commit node objects by updating the edits and repair data (see below) within.
That's because it's possible that the child branch may itself be the parent branch of some other child branch,
whose undo queue includes those commit nodes.
The child-most branch's commit nodes should not be affected by the fact that its parent branch executed a pull.

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

Creating a concrete undo (or redo) edit requires access to the repair data associated with the edit to be undone/redone.

### Deriving Repair Data

Repair data needs to be created when an edit is made on a local branch.

#### For New Local Edits

This can be done by creating a repair store with access to the forest that drives the application UI for this branch
and passing the `Delta` for the edit to the repair data store _before_ that same delta is applied to the forest.
This is the same data-flow as what is currently being used to rollback transactions (whether they are aborted or not).
In the future this may change to a model where the repair data is queried from the forest as part of applying the `Delta` to it.

#### For Rebased Local Edits

Repair data also needs to be (re)created when a local edit is rebased in the face of changes on the parent branch (possibly the trunk).
In that case, we need to reapply the rebased version of the original edits to a separate forest solely for the purpose of generating the repair data.
"Separate" here means that the forest is not the forest that drives updates to the application's UI.

The reason we need to use a separate forest is that the normal forest gets updated with a more efficient delta
(which takes into account the fact that the original version of the rebased changes had already been applied).
For example, if a local edit deleted some node foo,
and that edit needed to be rebased over an incoming edit that edits foo in some way,
then the forest that drives the UI should receive an empty `Delta`.
However, for the purpose of getting the correct repair data for the rebased edits,
we do need to get some forest into the state where foo exists and the incoming edit has been applied to it,
so that we can gather the correct repair data for foo and associate that repair data with the rebased edit.

There are two ways we can get a forest into that state:

1. Fork the forest that drives the UI for that branch,
   apply the inverse of the original (i.e., unrebased) local edits,
   then apply the incoming edit(s).
2. Fork the forest that drives the UI for the parent branch.

Option #2 is bound to be more efficient but may require a more complex contract between parent and child branches.
These options should be explored during implementation.

### Managing Repair Data

This data can be stored in a repair data store that is co-located with the edit on the relevant commit tree.
This approach has the following pros and cons:

-   Con: This approach fails to take advantage of repair data store's ability to store repair data for multiple edits.
    Storing the repair data separately for each edit can lead to additional memory overhead because document paths are not shared between edits.
-   Pro: This approach does not require that repair data stores be able to remove repair data from their internal storage
    (which is not yet supported).
    This may also make up for the overhead mentioned above because it makes it faster to discard repair data
    (we just drop the reference to the store that contains the repair data).
