# Inverse Changes

This document covers the current design thinking around inverse changes.

## What are Inverse Changes?

> An inverse change is a change that is meant to undo the effect of a prior change.
> Applying a change and applying its inverse immediately after that should leave the document in the same state as it was before the original change.

Inverse changes are generated in two cases:
 * When an end user performs an undo operation in the Fluid-powered application.
 * When rebasing a changeset that is based on a prior change that has since been rebased.

## Tip Undo vs. Collaborative Undo

The traditional undo model that application developers are used to is that of an undo stack.
In this model, whenever the user performs an edit, an inverse is computed an pushed to the top of an undo stack.
When the user wishes to undo their last edit, the application pops the undo stack and applies the change
(potentially pushing it into a redo stack).

This model works because the current state is guaranteed to be the state that the inverse change at the top of the stack should apply to.
To borrow a term from source-control systems, the "tip" change
(i.e., the last change that was applied)
is the state that needs to be undone.
We call systems that works under these assumptions "tip undo" systems.

In a collaborative application, there are two complicating factors to consider:

 1. The change that resulted from the local user's last edit may not be the last change that was applied.
This is because other users can contribute changes.
Note that this can occur even without any concurrency.
Concurrency does however ensures that,
short of locking other clients out of editing the document,
a client that wishes to undo a change had no way to ensuring that it is aware of all such later changes.

 2. The change that resulted from the local user's last edit may have been rebased before being applied to the document.
This means that the matching undo needs to account for the effects of the rebased change.
Note that if a client wishes to issue an undo for an operation that has yet to be sequenced by the collaboration service,
then they cannot yet know the final rebased form of the change they are trying to produce the inverse for.

We call systems that work in the face of these constraints "collaborative undo" systems.
The rest of this document focuses on such systems.

## Retroactive vs. 

