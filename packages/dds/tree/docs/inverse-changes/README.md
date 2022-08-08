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

In a collaborative application, there are complicating factors to consider:

1. The change that resulted from the local user's last edit may not be the last change that was applied.
   This is because other users can contribute changes.
   Note that this can occur even without any concurrency.

2. Concurrency,
   short of locking other clients out of editing the document,
   means that a client that wishes to undo a change
   has no way of ensuring it knows about all the changes that may be applied between the change to be undone
   and the inverse change that it intends to issue.

3. The change that resulted from the local user's last edit may have been rebased before being applied to the document.
   This means that the matching undo needs to account for the effects of the rebased change.
   Note that if a client wishes to issue an undo for an operation that has yet to be sequenced by the collaboration service,
   then they cannot yet know the final rebased form of the change they are trying to produce the inverse for.

4. Concurrency again,
   means that unless they wait for the original change to be sequenced,
   the issuer of an undo for that original change may not be aware of all the changes that come before the original change.

We call systems that work in the face of these constraints "collaborative undo" systems.
The rest of this document focuses on such systems.

## Bird's Eye View

At a high level, we need to have a system for accomplishing the following:

1. Producing an inverse change for a given change that needs to be undone.
2. Reconciling this inverse change with any edits that have occurred since the undone change.
3. Updating the reconciled inverse in the face of concurrent changes.
4. Applying the updating and reconciled inverse to the current document state.

In designing such a system, we need to consider the relevant computational costs and drawbacks:

* Whether the semantics of undo a guaranteed
* Whether the issuer of the undo can be starved out by edits from peers
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
An application can define how far back past operations should be undoable.
Note that this could be defined in a number of ways:

* A number of local edits made by each client
* A number of edits across all clients
* A time window
* A maximum memory buffer
* Some combination of the above

For a given application profile,
our system may have different requirements depending on different undo scenarios.
Some key scenarios to consider are:

* Undoing a change that has yet to be sequenced.
* Undoing a change that has been sequenced but is not yet out of the collaboration window.
* Undoing a change that is out of the collaboration window.

Ultimately, designing our undo system requires answering the following questions:

1. What possible undo semantics could we and should we support?
2. What is the relevant data needed for the computation of undo?
3. Given the relevant data, how do we compute the needed changes to accomplish an undo?
4. How do we address concurrency challenges in issuing an undo?
5. How do we source the relevant data for each part of the computation?

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
2. The result of applying the inverse of the undone operation to the current state?
3. The same as what it would have been if the undone operation had not been performed in the first place
   (but interim operations were)?

Option #1 is what we refer to as "Rewind Undo".
It discards the effects of interim changes as well as the original change being undone.

Option #2 is what we refer to as "Patch Undo" (in the "band-aid" sense of the term).
It only undoes the parts of the original edit that are still undoable
and does not otherwise undo the effects of the original edit on interim edits.
For example,
if edit B is an interim edit that was concurrent to and sequenced after edit A,
and edit B had failed to apply because of the changes introduced by edit A,
then undoing edit A with patch undo *would not* bring back the effects of edit B.

Option #3 is what we refer to as "Retroactive Undo".
It undoes all of the effects of the original edit,
including its effects on interim edits.
For example,
if edit B is an interim edit that was concurrent to and sequenced after edit A,
and edit B had failed to apply because of the changes introduced by edit A,
then undoing edit A with retroactive undo *would* bring back the effects of edit B.

For both Patch Undo and Retroactive Undo,
it seems preferable if a change that is concurrent to
(and sequenced after)
both the original change and its inverse,
would end up behaving as though neither the original nor the inverse were ever issued.
Otherwise one would have to issue additional "undo updates" to apply the effect of undo to these changes as they become known.

For both Patch Undo and Retroactive Undo,
we could potentially consider whether the interim changes could successfully be applied if rebased over the inverse change.
If not, we could prune the inverse change to make it so.
This would have the effect of only undoing changes that no interim change depends on.
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

## Relevant Data

In order for us to compute the required document changes needed in the face of an undo,
we need to have access to the following data:
* The original change to be undone
* All of the interim changes sequenced since the change to be undone
* Any document state that we wish to restore as part of the undo,
but cannot derive from the the original change or interim changes.

This last bullet point may not be immediately obvious,
but it is a critical issue.
We may need to recover information about the state of the document before the change that we wish to undo
because changes can be destructive:

* Setting the value on a node loses information about the prior value of that node.
* Deleting a subtree loses information about the contents of that subtree.

Such data cannot be derived solely from the original changeset to be undone
(or interim changes).
We refer to the information that is needed in addition the original changeset as "repair data".

## Computing Undo Changes

The end result of an undo is the production of a Delta that can be applied to the tip state of all clients.

No matter how we design our undo system,
the starting point is always a user's intent to undo a prior change,
and the end point is always the production of a document state Delta that has the desired undo effect.
This is a journey from a very abstract representation ("Undo change foo")
to a very concrete one (e.g., "set the value of node X to 42").

At a high level, our computation needs to perform the following three steps:
1. Derive an inverse changeset from the changeset being undone.
2. Reconcile the inverse with interim changes to produce an undo change.
3. Derive a Delta from the undo change.

In that process,
we have some latitude as to whether the inverse change in step #1 should contain repair information,
(e.g., "set the value of node X to 42")
or whether it should remain more abstract
(e.g., "revert the value of node X to the revision before change foo").
We will return to this question in the
[Late Repair Data Concretization](#late-repair-data-concretization) section.
For now, we consider the approach of creating an inverse that is as concrete as possible.

### Deriving an Inverse Changeset

TODO: Expand on...
* Set Value -> Set Value
* Insert -> Delete
* Delete -> Revive
* Revive -> Delete
* MoveOut + MoveIn -> Return + MoveOut
* Return + MoveOut -> MoveOut + Return
* MoveOut + Return -> Return + MoveOut
* Forward -> Unforward
* Scorch -> Heal

### Reconciling Inverse and Interim Changes

Once we produce an inverse for the original change,
we need to reconcile it with any interim changes that may have been sequenced since.
Note that each such interim change could be...
* concurrent with the original change.
* concurrent with the inverse change.

For each set [Undo Semantics](#Undo-Semantics),
the reconciliation proceeds by composing the following sequences of changes:

* Rewind Undo:
  * The inverse of each interim change in reverse order
  * The inverse of the original change
* Patch Undo:
  * The inverse change rebased over the interim changes
* Retroactive Undo:
  * The inverse of each interim change in reverse order
  * The inverse of the original change
  * The interim changes rebased over the inverse of the original

Composing the above sequences of changes yields a changeset that can be applied to the tip state.

### Deriving a Delta

TODO: expand on...
* Revive -> Insert
* Return -> MoveIn
* Unforward -> Nil
* Heal -> Nil

## Addressing Concurrency

The previous section outlined a process for computing the adequate undo changeset,
but did so ignoring any of the complicating factors brought about by concurrency
(see factors #2 and #4 in [Tip Undo vs. Collaborative Undo](#tip-undo-vs-collaborative-undo)).

If the issuer of the undo performs the computations in the previous sections,
then there are three concurrency cases that may need handling:
1. changes concurrent to and sequenced before the original change and its undo
2. changes sequenced after the original change but concurrent to and sequenced before the undo
3. changes concurrent to and sequenced after both the original change and its undo

Note that a single undo may need to deal with a combination of these.

### Case #1: Changes Concurrent to and Sequenced Before the Original

Case #1 can arise when trying to undo a change that has yet to be sequenced.
This is particularly challenging because it means that
the client issuing the undo is doing so based on a version of the original change that is not final.
In other words, that client does not know the precise changeset it is attempting to undo.

We see three possible strategies for handling the fact that this case can arise:

#### Delaying

One possible strategy for handling this case is to avoid it entirely by only allowing clients to
undo edits that have been sequenced.
This could be hidden from the end user by having applications apply the undo locally
(re-computing it as other sequenced changes come in)
and only sending the now updated undo when the original change is received from the sequencing service.

#### Validation by Peer

The client issuing the undo computes it based on the set of changes it knows about.
The receiving peers can then check whether
there were concurrent changes sequenced before the original edit that the issuer did not take into account.
If so, then the undo is rejected, forcing the issuer to send it again.
If not, then this case did not materialize and the changeset sent by the issuer can be used in further computation.

Note that in the rejection case,
on the next attempt,
the issuer is guaranteed to know of all the changes preceding the original change.
This means that,
as far as this concurrency case is concerned,
a client cannot get stuck trying to undo a change.

#### Computation by Peer

Peers receiving the undo are responsible for re-computing the inverse based on the now known sequencing order.

### Case #2: Changes Sequenced After the Original But Concurrent to and Sequenced Before the Undo

This case is the analog of the typical concurrency case outside of undo:
each client's changes may need rebasing before being applied.
When that change is an undo,
the change that would otherwise be rebased over is an interim change so
the reconciliation process detailed in the
[Reconciling Inverse and Interim Changes](#reconciling-inverse-and-interim-changes)
section above must be followed.
This is important not only because this process is potentially different from the normal rebase process,
but also because it may entail computing inverses of new changes,
which in turn requires having access to the adequate repair data for those changes.

This leaves us with two alternatives for handling these cases:

#### Validation by Peer

The client issuing the undo computes it based on the set of changes it knows about.
The receiving peers can then check whether
there were concurrent changes sequenced before the undo edit that the issuer did not take into account.
If so, then the undo is rejected, forcing the issuer to send it again.
If not, then this case did not materialize and the changeset sent by the issuer can be used as is.

Note that in the rejection case,
on the next attempt,
the issuer is *not* guaranteed to know of all the concurrent changes that will be sequenced prior to its undo.
This means that with this approach,
as far as this concurrency case is concerned,
a client *can* get stuck trying to undo a change.

#### Computation by Peer

Peers receiving the undo are responsible for updating the undo change as appropriate.
This means clients need to have access to repair data for changes within the collaboration window.

### Case #3: Changes Concurrent to and Sequenced After Both the Original and Undo

Such changes need rebasing over
the original change,
any interim changes,
and the undo change.
This is something peers should be equipped to perform without need for additional data as part of the normal rebase process.

It does mean however that we must design inverse changes and the output of rebase to ensure that
a change being rebased over an inverse change
after having been rebased over the original would undo the effects of rebasing over the original.
See [Deriving an Inverse Changeset](#deriving-an-inverse-changeset) for more details.

## Sourcing Relevant Data
--
Concrete vs. abstract change: concretize in change->delta?
Concrete late means:
* We may avoid the need for repair data entirely
* Separation of concern that feels right:
  * some code is responsible for characterizing which changes ought to happen
  * some code is responsible for making it happen

We could have an intermediary format that allows rebasing and composition, while using a little repair data as possible.
We add the remaining repair data at the end if need be.
This means the format that the rebaser deals with is not the same as the format that the toDelta converter deals with.
--
Some DDSes address the need for repair data by including it in all changesets:

* Each set-value operation carries with it the value being overwritten.
* Each delete operation carries with it the contents of the subtrees being deleted.

A client that needs to produce an inverse change
would therefore use that additional information in the changeset in order to produce its inverse.

This scheme is unfortunately not directly applicable to SharedTree.
A move operation that is concurrent with (and sequenced prior to) a delete operation
may move a subtree under the deleted subtree.
The repair data included in the delete operation would not contain that subtree.
In order for a client to produce a concrete inverse change,
it would need to know the contents of the subtree that was moved.
This could be resolved by including the contents of moved subtrees in all move operations,
but doing so would make moves prohibitively expensive.
Even without move operations (which some applications may be happy not to use),
this scheme still bloats normal (i.e., non-inverse) operations with repair data that may never be used.
This bloat has a negative impact on the size of the document change history
as well as the performance of the service as whole (increasing latency and server costs).

The most trivial way to ensure we can recover this information
is to keep past revisions of the document available so long as they lie within the undo window.
Even with the use of persistent data structures, this could be a lot of data.
Moreover, since we will only need to recover whatever information we cannot derive from the original change,
it seems wasteful to include other data.

Client applications could choose window of arbitrary size
(less than or equal to the undo window)
for which to keep repair data on clients locally.
In cases where the edit to be undone falls outside of that window,
the client would resort to requesting relevant data from the service.
Note that this would however make the obtention of this data asynchronous.

Note that repair data is available to all clients when all the changes that last contributed state
to the portions of the document being deleted or overwritten by a change that is being undone
are still within the collaboration window.
This is likely to be rare in practice because collaboration windows tend to be much shorter
than the lifetime of document contents.


### Rebasing Over Original and Inverse Changes

If the original change being undone is still within the collaboration window,
then it's possible that some later changes may be concurrent to both the original change and the inverse.
This is important because the original change may have an impact on these later concurrent changes,
and a change that is being rebased over both the original change and the inverse change
should in the end not be affected by the pair of them.
For example, if the original change was a slice-delete and the rebased change was an insert that would commute with the slice,
then the final rebased change should not be affected by the slice delete.
This requires that inverse changes are able to counter the effects of
the change they seek to counteract in changes that are sequenced after that inverse.

## Abstract vs. Concrete Over the Wire Representation

Somewhere along this process of concretization, the desired change needs to be communicated to peers.

Whether this happens early or late in the concretization has important consequences for the computational needs of our system:

* The more concrete the on-wire change representation,
  the larger (and possibly more redundant) that representation will be.
* The more abstract the on-wire change representation,
  the more work each peer must do to apply the change.

Note that having peers perform a larger portion of the concretization work
is not only an issue of CPU load,
but also an issue of data availability:
we would indeed be forced to ensure that peers have access to the relevant data locally,
or require that they query the Fluid service to fetch such data.

During the rebasing of the inverse change,
some of the repair data may stop being relevant.
Doing the rebasing before we pay the cost of fetching repair data may be more efficient.

### Rebasing Over Concurrent Interim Changes

As stated earlier
(see complicating factor #2 in [Tip Undo vs. Collaborative Undo](#tip-undo-vs-collaborative-undo)),
the issuer of an undo cannot in principle know about all the interim changes that be may be sequenced
between the original change and the undo.
This means that either...

* Peers accept an outdated undo and attempt to apply it nonetheless.
* Peers only accepts inverses with a reference sequence number that matches the tip of the history,
  thereby forcing the client issuing the undo to resend an updated inverse.
* Peers must be able to further rebase whatever inverse change is sent over the wire.
  * Requires peers to preserve repair data for edits that are within both the collab window and the undo window
    (i.e., within whichever window is shorter).
    This must be the repair data for the most rebased version of the edit.
    This may need to include repair data for concurrent edits applied after
    (e.g., an insert or move into the subtree being deleted by any edit being undone)

## On Peer Computation

If sending an inverse for an original change that has yet to be sequenced,
there's a possibility there exists some other changes concurrent to this original change.
Some of these concurrent changes may be sequenced after the original change
(in which case they are interim changes),
but it's also possible that some of them may be sequenced before the original change.
This is important because those changes may influence the impact of the original change.
If a client issues an inverse for a change that has not yet been sequenced,
there is therefore a possibility that peers will receive an inverse that is unusable.

### What all needs to go into summaries?

## Choosing a Design

Generally speaking we strive for the following design goals:

* Allow applications not to incur computational costs (whether on the service or on clients)
  for features they do not wish to use.
* Given the choice to put a computational burden on the service or on the clients,
  put it on the clients.
* Given the choice to put a computational burden on a specific client that wishes to use a feature,
  or on all peers of such client, put it on the specific client.
  (Note: this is true even when all participants are running the same client application
  but even more so when they are not).

Proposed design:

* Don't preemptively include repair data in ops.
* The client that wants to issue an undo is forced to compute the repair data.
  * Client may preemptively store repair data for a portion of their undo window.
  * If a client needs to undo a change that falls outside of this portion,
    then they may need to recover the missing repair data from either:
    * V1: a new (partial) checkout
    * V2: a document state history service
* The on-wire changeset includes the repair data.
  * V1: inlined plain data as though it was seen for the first time
  * V2: as references to new blobs of plain data
  * V3: as references to a mix of new blobs and old blobs
  * V3.1: consider not reusing old blobs if the amount of data reused from them is small enough
  * V4: as references to parts of the document in space-time (queried by peers from a history server)
  * V2+.1: consider inlining the repair data in the changeset when it is small enough
* When receiving the inverse, peers apply it as is if no concurrent interim changes occurred,
  otherwise they either:
  * A: attempt to apply outdated inverse
  * B: reject the changeset, forcing the issuing client to try again
  * C: supplement any missing repair data by either
    * C1: leveraging a local store that they maintain for the span of min(collab window, undo window)
    * C2: requesting repair data from the service

The tradeoffs are summarized in the following table.
The variables are as follows:
 * Given:
   * `I` (Intentions): the number of independent changes performed within a changeset.
   This is typically bounded by the number of actions performed by the user.
   * `R` (Repair): the amount of repair data necessary to undo a given change.
 * Chosen:
   * `Iw` (Issuer window): the window within which the issuer of an undo maintains local repair data for prior edits.
    This is never greater than the undo window.
   * `Pw` (Peer window): the window within which peers maintain local repair data for prior edits.
    This is never greater than the collab window.


| Criteria                                           | Accept Stale Invert               | Reject Stale Invert               | Update Stale Invert               |
| -------------------------------------------------- | --------------------------------- | --------------------------------- | --------------------------------- |
| Undo semantics are guaranteed                      | No                                | Yes                               | Yes                               |
| Undoing client cannot be starved out               | Yes                               | No                                | Yes                               |
| Size overhead on normal changesets                 | None                              | None                              | None                              |
| Size of inverse changesets                         | V1: O(I + R)<br/>V2+: O(I)        | V1: O(I + R)<br/>V2+: O(I)        | V1: O(I + R)<br/>V2+: O(I)        |
| Size of locally stored local repair data on issuer | O(Iw * (I + R))                   | O(Iw * (I + R))                   | O(Iw * (I + R))                   |
| Size of locally stored local repair data on peer   | None                              | None                              | O(Pw * (I + R))                   |
| Issuer needs to query service                      | If seq(orig) > Iw                 | If seq(orig) > Iw                 | If seq(orig) > Iw                 |
| Issuer needs to upload to service                  | V1: No <br/>V2-3: Yes <br/>V4: No | V1: No <br/>V2-3: Yes <br/>V4: No | V1: No <br/>V2-3: Yes <br/>V4: No |
| Peer needs to query service                        | No                                | No                                | If ref(undo) > Pw                 |

The design above has the following characteristics:
* Applications can opt out of undo support on a per-document basis,
paying no overhead for its support in other documents/applications.
* In applications where one can only undo edits from one's own session,
participants that do not contribute edits or are unable to issue undos,
only need to maintain repair data for the peer window.

The above does not account for partial checkouts.
The expected effect of partial checkouts
is that an issuer or a peer may be forced to fetch repair data from the service
for edits that fell outside of their checked out subtree.
This is no different from the requirements of normal edit application in the context of partial checkouts.

Note that any scheme that relies on blobs or other independently fetched data to represent repair data in over-the-wire changesets
requires clients to fetch this data before they can apply such incoming changesets.
This not something that the Fluid runtime currently supports but is a capability needed in the more general case of large inserts.

## Possible Improvements

### Blob Attachment

There may be opportunities for peers to be spared the additional network fetch in cases where the service knows the peer window size.
Indeed, the service could automatically attach or inline required blobs when broadcasting an inverse change
when that change contains references to blobs that contain repair data for prior edits that fall outside of the peer window size.
The same idea could also be applied to partial checkouts.

### Late Repair Data Concretization

## Undo Recognition

When the user does something that effectively amounts to undoing their prior changes,
it may make sense to automatically interpret their changes as an undo.
Doing so would reduce the chances that a user may be surprised by the subtle differences between their action and an actual undo.
For example,
moving a range of nodes from one place to another and moving them back
is different from moving them and undoing the fist move
in that the former means concurrent inserts between the nodes in the moved range would end up on either extremity of the moved nodes.

Such a policy should be managed by the application and exist entirely outside
(atop) the undo system.