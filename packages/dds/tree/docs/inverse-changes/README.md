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

## Bird's Eye View

At a high level, we need to have a system for accomplishing the following:
1. Producing an inverse change for a given change that needs to be undone.
2. Reconciling this inverse change with any edits that have occurred since the undone change.
3. Applying the reconciled inverse to the current document state.

In designing such a system, we need to consider the relevant computational costs and drawbacks:
* The size of "normal" (i.e., non-inverse) changes sent over the wire.
* The size of inverse changes sent over the wire.
* The size of the local data a client needs in order to issue an inverse change.
* The size of the local data a peer needs in order to apply an inverse change.
* The ability for a client to issue an inverse change without needing to make network requests.
* The ability for peers to apply an inverse change without needing to make network requests.

We need to consider the above for different application profiles.
Indeed some applications may not want to support undo at all,
while some other application may wish to support undo of arbitrarily old operations.
We generalize this by introducing the concept of an "undo window".
An application can define how far back (either in time, number of edits, or memory buffer) past operations should be undoable.

For a given application profile,
our system may have different requirements depending on different undo scenarios.
Some key scenarios to consider are:
* Undoing a change that has yet to be sequenced.
* Undoing a change that has been sequenced but is not yet out of the collaboration window.
* Undoing a change that is out of the collaboration window.

Generally speaking we strive for the following design goals:
- Allow applications not to incur computational costs for features they do not wish to use
- Make features 

## Retroactive Undo vs. Patch Undo

The fact that we may find ourselves trying to undo a change that is not at the tip of the document history
forces us to consider two options for what semantics we want undo operations to have.
Should the state of the document after the undo operation is applied be...
1. The same as what it would have been if the undone operation had not been performed in the first place.
2. The result of applying the inverse of the undone operation to the current state.

There is also the option of simply reverting to document state before the undone operation,
but we do not consider this option viable as it would discard the edits performed since the undone operation.

In either case we find ourselves trying to reconcile two things:
 * The inverse change for the original change to be undone.
 * The changes that have occurred since the original change.
We refer to these as the "interim" changes.

We are forced to reconcile these because the inverse change we're issuing has to apply to the local tip state.
We could not for example simply apply this inverse to the current state because this inverse 

Option #1 is what we refer to as "Retroactive Undo".
We take the inverse as a given and derive its net effects on the concurrent changes.
In practice, this means we 

Option #2 is what we refer to as "Patch Undo" (in the "band-aid" sense of the term).

SharedTree can be made to support either or both options.


