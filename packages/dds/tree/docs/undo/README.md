# Undo

This document offers a high-level description of the undo system.
It should be updated once more progress is made on the implementation.

## Undo Model and Semantics

There are several different choices for what the semantics of undo could be.
At the same time, there are several different undo-related workflows that consuming applications may want to support.
Understanding those workflows and uncovering what undo semantics would best serve them is still a work in progress,
but two key points have emerged in that space:

1. Undo as a feature is very important in that it is likely to be the only/primary way that end users access document history.
2. While we can offer advanced/powerful undo semantics,
   most applications are likely to adopt a workflow that
   is simple for users to grasp,
   and fits within the confines of their existing user interface.

See
[the brain-dump on inverse changes](../wip/inverse-changes/README.md#undo-semantics)
for some prior thinking on undo semantics.

## Abstract vs. Concrete Undo Messages

Conceptually, an undo edit starts as a very abstract and succinct intention:
"Undo changes from prior change _\<revision-tag\>_".
It ultimately needs to be converted into a concrete description of how the undo changes the current state of the document
(e.g., "delete the node at this path").
The application (typically through Forest) is able to process this concrete form, represented as a delta.

One key design question is:
what form should the undo edit be in when it is sent by the issuing client to the sequencing service?
We can think of this as asking which part of the concretization process should happen on the client that is issuing the undo (i.e., pre broadcast),
and which part should happen on peers upon receiving the undo (i.e, post broadcast).

This choice is subject to many tradeoffs:

-   Access to historical data (original change, [repair data](../repair-data/README.md), [interim changes](#interim-change))
    -   Pre-broadcast computation puts the burden of providing historical data on the issuing client.
    -   Post-broadcast computation puts the burden of providing historical data on all peers
        (which means that this data must be included in summaries).
-   Access to sequencing information for the undone edit
    -   Pre-broadcast computation may occur before the undone edit is sequenced.
    -   Post-broadcast computation will occur after the undone edit is sequenced.
-   Access to sequencing information for the undo edit
    -   Pre-broadcast computation will occur before the undo edit is sequenced.
    -   Post-broadcast computation will occur after the undo edit is sequenced.
-   Computational load
    -   Pre-broadcast computation only consumes computational resources on the issuing client.
    -   Post-broadcast computation consumes computational resources on all peers.

Note that larger summary sizes and larger message sizes both increase the network/server load and make (down)loading documents slower.

Because the above choice has such a performance impact,
we give applications some agency in choosing the tradeoff that works for them.
We accomplish that by introducing the concept of an "undo window".

## The Undo Window

The undo window defines how far back, in terms of the edit history,
peers are expected to retain information about past edits and their associated repair data.
Applications can decide to support an undo window of arbitrary size.
The longer the undo window, the more edits are undone using the post-broadcast approach.
The shorter the undo window, the more edits are undone using the pre-broadcast approach.

For the relevant data to be retained, it must first be obtained.
This happens in two ways:

-   When a peer joins a session, the relevant historical information is included in the summary.\*
-   When a peer receives a new edit from the sequencing service,
    it computes the corresponding repair data and stores it alongside the edit.

\* Technically, the historical data needed for undo could be loaded separately in an effort to reduce startup time.

As older edits fall outside of the undo window, the edit information, including its repair data,
can be deleted from the peer's memory.

When issuing an undo,
a client will therefore proceed differently depending on whether the change to be undone lies within the undo window or not.

## Undo Edits Within The Undo Window

Note that this includes cases where the client issuing the undo is also the issuer of the change to be undone,
and that client has yet to receive the change to be undone back from the sequencing service.
This can happen when a client wants to issue an undo very soon after issuing the change to be undone.
It can also happen whenever a client has been offline for some period of time.

Issuing an undo for a change that falls within the undo window can be done by sending an edit that indicates the `RevisionTag` of the edit to be undone.
Such an undo edit is not a changeset.
The receiving peers will construct a changeset based on it, and apply that changeset to their tip trunk state.

Note that the issuer of an undo may attempt to undo a change that is within the undo window,
send the adequate undo message,
and find out that by the time the undo message was sequenced,
the edit to be undone had fallen out of the undo window.
In such circumstances, the undo fails (all peers ignore it).
The issuer of the undo can either give up on undoing the change,
or try again in the new context (i.e., undoing an edit outside the undo window).

## Undo Edits Outside The Undo Window

In a low-frequency (i.e. non-live) collaboration environment,
the edit to be undone will commonly lie outside of the undo window.

There are several approaches we could consider.
All of them have to contend with the fact that peers may not have access to the relevant historical data necessary to perform the undo.
The approaches listed below all rely on having the issuer of the undo send the relevant data in some form as part of the undo message.
For this to be possible, the issuing client must itself have access to the historical data in question.

### Historical Data on the Issuing Client

We expect users are typically interested in undoing their own edits
or undoing edits that had an impact on their edits.
The historical data necessary for that can be retained on the issuing client by not discarding historical data for edits that fall outside the undo window.
A limit may be imposed on how far back this historical record goes in order to avoid unbounded memory growth,
but the option of storing some of this information on disk is likely to make the limit tolerable.

If this were to prove insufficient
(either because of a need to undo edits before the client joined,
or because of the need to undo edits whose historical data had been dropped due to the limit mentioned above)
it may be possible for the client to request the missing data from a history server.
Note this this would make the undo operation asynchronous for the issuing client.

The presence of a history server also means that the peers could fetch the historical data from it rather than have the issuing client send that data as part of the undo message.
This however has two undesirable properties:

-   It makes the application of the undo asynchronous for all peers.
-   It means the history server will have to serve all clients.
    This may prove to be an unacceptable workload for sessions with many participants.

### Undo Messages for Edits Outside The Undo Window

We now turn to the different ways the historical data on the client can be used to undo edits that lie outside of the undo window.

#### Abstract Undo With Historical Data

In this approach,
the only difference between the message sent when undoing an edit that lies within the undo window
and undoing an edit that lies outside it,
would be that the latter includes additional historical data.

This is the approach we currently intend to implement long term.
(See [V1 Undo](#v1-undo) for short-term horizon)

One challenge with this approach is that it could result in attempting to send prohibitively large amounts of historical data.
That's because applying the undo _may_ require historical data not only from the edit to be undone,
but from all edits that occurred after it also.
This could be alleviated by having the issuing client determine which parts of the historical record actually are required
and not sending the parts that are not.

#### Undo as a Regular Changeset

In this approach,
the issuing client computes the net change to the tip state and sends that as a normal changeset.
Such a changeset would be rebased over any concurrent edits as changesets normally are.
Note that this precludes having undo-specific logic for rebasing the change over concurrent edits.

#### Undo as a Special Changeset

This approach is similar to the "Regular Changeset" approach,
with the difference that the undo changeset would receive special rebasing treatment in order to impart the desired undo semantics.
For example, the undo changeset could be [postbased](#postbase) over concurrent edits instead of rebased.

## Partial Undo

Longer term, we may support a more localized undo that only reverts changes within a specific region of the document.
For example, a user may wish to undo all the changes they made to a specific region of the document even though the edit that included those changes also included changes to other regions of the document.
Partial undo would allow such a user to only undo the changes within the region of interest.

This could be achieved by including in the undo message a characterization of the region of the document to be affected by the undo.
This may need to be characterized as a combination of input context regions and output context regions.

## V1 Undo

Here we detail the vision for the first implementation of undo/redo.
This implementation is meant to satisfy our needs for parity with experimental (AKA legacy) SharedTree.

This first version aims to achieve some basic undo functionality with a minimum amount of code changes and complexity.
To that end, we mostly reuse the existing code paths for changesets by always sending
[concrete undos](#abstract-vs-concrete-undo-messages) over the wire.
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

#### Creating Concrete Redo Edits

Redo changesets should be created by inverting the corresponding undo changeset and rebasing that inverse over all the edits that were applied since the undo.This is preferable to rebasing the original edit over all the edits that were applied since before the original edit:

-   It is better at mitigating data-loss caused by undo.
    For example, undoing an insert will delete any content that has since been added under the inserted node.
    Applying the inverse of the undo will restore that content while re-applying the original insert will not.
-   It is more efficient as it doesn't require rebasing over as many edits.

### The Undo Commit Tree

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

### The Redo Commit Tree

The tree of redoable commits is maintained across branches in a similar fashion to the undoable commits tree.
Redoable commits are effectively undoable commits and can therefore use the same `UndoableCommit` structure described above.

### Reacting to Local Edits

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

### Forking

When a branch is forked, the new branch can simply obtain the head undoable and redoable commit pointers from the parent branch.
This helps keep forking cheap.

### Pulling

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

### Dropping Old Commits

As sequenced edits fall out of the collab window,
we have the option to either drop or retain the corresponding commit nodes in the undo tree.
We can let the application pick a maximum length for the undo queue of the user.

Retaining commits that fall out of the collab window muddies the statement that this commit tree is a sparse version of the normal commit tree.
It can be still be thought of as sparse if we ignore the fact that sequenced commits get dropped from it as the collab window advances.

### Repair Data

Creating a concrete undo (or redo) edit requires access to the repair data associated with the edit to be undone/redone.

#### Deriving Repair Data

Repair data needs to be created when an edit is made on a local branch.

##### For New Local Edits

This can be done by creating a repair store with access to the forest that drives the application UI for this branch
and passing the `Delta` for the edit to the repair data store _before_ that same delta is applied to the forest.
This is the same data-flow as what is currently being used to rollback transactions (whether they are aborted or not).
In the future this may change to a model where the repair data is queried from the forest as part of applying the `Delta` to it.

##### For Rebased Local Edits

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

#### Managing Repair Data

This data can be stored in a repair data store that is co-located with the edit on the relevant commit tree.
This approach has the following pros and cons:

-   Con: This approach fails to take advantage of repair data store's ability to store repair data for multiple edits.
    Storing the repair data separately for each edit can lead to additional memory overhead because document paths are not shared between edits.
-   Pro: This approach does not require that repair data stores be able to remove repair data from their internal storage
    (which is not yet supported).
    This may also make up for the overhead mentioned above because it makes it faster to discard repair data
    (we just drop the reference to the store that contains the repair data).

## Glossary

### Interim Change

A change that is sequenced after the change to be undone, but before the undo change.
Interim changes may depend on the change being undone.

### Postbase

A variant of rebase.
Postbasing change `a` over change `b`,
where `a` applies to state `s` and produces state `sa`
and `b` applies to state `s` and produces state `sb`,
produces a change `a'` that applies to state `sb` and produces the state `sab`,
which is the same state one would get by applying `rebase(b, a)` to `sa`.
