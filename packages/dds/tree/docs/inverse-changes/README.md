# Inverse Changes

This document covers the current design thinking around inverse changes.

Some terminology:
While the terms "client" and "peer" can often be used interchangeably,
this document deliberately uses "client" to refer to the issuer of a change,
and "peer" to refer to the receiver of a change.
While all clients are ultimately peers and vice-versa,
this distinction helps us differentiate work that is done before a change is sent to the Fluid service
(which we refer to as "client work") and work is done after a change is received from the Fluid service
(which we refer to as "peer work").

## What are Inverse Changes?

> An inverse change is a change that is meant to undo the effect of a prior change.
> Applying a change and applying its inverse immediately after that should leave the document in the same state as it was before the original change.

Inverse changes are generated in two cases:
 * When an end user performs an undo operation in the Fluid-powered application.
 * When rebasing a changeset that is based on a prior change that has since been rebased.

## The Case of Rebase-Induced Inverses

In a live collaboration session,
changes are sent as soon as they are first created
and are therefore unaffected by rebasing and any inverse changes that such rebasing my involve.

In an asynchronous collaboration session,
the changes sent over the wire may be the result of rebasing operations.
This does not however imply that that such changes will contain inverse changes:
while rebasing sometimes requires the production of inverse changes,
those inverse changes are always rebased over instead of being added to the end product of a rebase.
At most, a change that is rebased over an inverse change may accumulate some information about how that inverse change affected it
(e.g., by storing tombstones that refer to it), but the inverse changes themselves never make it to the rebased change.

This means that the needs of our system when it comes to inverse changes in rebasing
are entirely subsumed by the needs of undo.
The remainder of this document therefore focuses undo,
but rebase-induced inverses are also mentioned where they deserve special consideration.

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
3. Updating the reconciled inverse in the face of concurrent changes.
4. Applying the updating and reconciled inverse to the current document state.

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

While this is a lot of factors to consider,
there really are only two central questions to consider:
1. What possible undo semantics could we and should we support?
2. How abstract or concrete should the representation of undo change be at the time of broadcast by the issuing client?

## Undo Semantics

### Possible Semantics: Rewind vs. Retroactive vs. Patch

Before we describe the technical choices associated with undo,
we should clarify the net effect we expect undo operations to have.
In other words, we need to define the possible semantics of undo in our collaborative system.

Due to the collaborative nature of the system in which we operate,
it's possible for some interim changes to occur between the change to be undone and the tip of the document history
(which is where the inverse is slated to apply).
(Technically, this challenge can also arise in a non-collaborative system if the undo model supports undoing older changes made by the user either without undoing the later changes made by the user.
In our case, this challenge is forced on us by collaboration even for applications which only wish to undo the last changes performed by the local user).

The fact that we may find ourselves trying to undo a change that is not at the tip of the document history
forces us to consider two options for what semantics we want undo operations to have.
Should the state of the document after the undo operation is applied be...
1. The state before the undone operation?
2. The same as what it would have been if the undone operation had not been performed in the first place
(but interim operations were)?
3. The result of applying the inverse of the undone operation to the current state (which includes the effect of interim changes)?

Option #1 is what we refer to as "Rewind Undo".
It discards the effects of interim changes.
In practice, this means the change we construct for the tip state is equivalent to:
* Undoing all interim changes

Option #2 is what we refer to as "Retroactive Undo".
We adopt the inverse as a given and derive its knock-on effects on the interim changes.
In practice, this means the change we construct for the tip state is equivalent to:
* Undoing all interim changes
* Applying the inverse changes
* Applying the interim changes rebased on the inverse

Option #3 is what we refer to as "Patch Undo" (in the "band-aid" sense of the term).
We adopt the interim changes as a given and derive their knock-on effects on the inverse.
In practice, this means the change we construct for the tip state is equivalent to:
* Applying the inverse change rebased over the interim changes

For both Patch Undo and Retroactive Undo,
we could potentially consider whether the interim change could successfully be applied if rebased over the inverse change.
If not, we could only prune the inverse to make it so.
This would have the effect of only undoing changes that no other change since depends on.
For example, if the original change to be undone inserted a subtree,
then the final inverse would only delete that subtree if no interim changes had performed operations within this subtree.

### Which Semantics to Support

There is still some debate as to which semantics are preferable.
One relevant fact to consider is that the commanding system's support for undo,
which would roll back interim change and the change to be undone then re-run the commands for the interim edits,
is closest in spirit to Retroactive Undo.

We currently aim to build a system that could support them all and let application authors decide which to leverage in a given scenario.
The practical impact is that when reconciling inverse and interim changes,
we need to support rebasing an inverse change over its interim changes as well as rebasing interim changes over the inverse change.
We must therefore ensure that the relevant information to do so is available.

## Abstract vs. Concrete Over the Wire Representation

No matter how we design our system.



## You can't just send "undo op X" when it comes to non-undo inverses

## Choosing a Design

Generally speaking we strive for the following design goals:
* Allow applications not to incur computational costs for features they do not wish to use.
* For features that are used more rarely, prefer pay-as-you-go computational cost as opposed to a ubiquitous overhead
 (e.g., if a client want to use the feature then we prefer for that client to bear more of the computational cost as opposed to having peers bear it).