# Repair Data

This document offers a high-level view of our design choices regarding repair data.
It should be updated once more progress is made on the implementation.

## What is Repair Data

In order to undo an edit `e` that was applied to state `s1` and yielded state `s2`,
we need to construct an inverse edit `e⁻¹` that yields state `s1` when applied to state `s2`.
Computing `e⁻¹` requires the following information:

-   The original change to be undone
-   Any document state that we wish to restore as part of the undo
    but cannot derive from the the original change.

This last bullet point may not be immediately obvious,
but it is a critical issue.
We may need to recover information about the state of the document before the change that we wish to undo
because document changes can be destructive:

-   Setting the value on a node erases information about the prior value of that node.
-   Deleting a subtree erases information about the contents of that subtree.

Such data cannot be derived solely from the original changeset to be undone.
We refer to the information that is needed in addition to the original changeset as "repair data".

## Three Contexts

Repair data is used in three different contexts.

### Rolling Back Local Transactions

When a client needs to edit the document, it runs a command as part of a transaction.
Commands are allowed to return a special value to communicate to the transaction code that the transaction should be aborted.
When that happens, any edits that the command had already applied to the document state need to be rolled back.

Rolling back changes could be achieved by editing a separate copy of the document during the transaction
(possibly though a persistent data structure, or a copy on write system).
The current implementation (which will likely change soon) edits the one true document state as the transaction progresses, and rolls back the changes afterward.
It actually rolls back the changes even if the transaction succeeds,
but that's not particularly relevant to our discussion.

### Local Branch Updates

When a client successfully completes a local transaction,
it updates the local document state to reflect the impact of the edit,
and it sends the edit to the service for sequencing.
Under ideal circumstances, the next edit that the client receives from the service is that same edit that it had applied locally and sent for sequencing.
If that's the case, the client does not need to update the document state.
It's possible for an edit from a peer to be sequenced before the edit that was applied locally and sent out.
When that happens,
the local client needs to update the document state to reflect not only the impact of the edit from the peer,
but also the impact that the peer edit has on the local edit.

Consider the following example:

-   Local edit: Delete nodes A and B iff A and B exist.
-   Peer edit: Delete node A.

If the peer edit is sequenced before the local edit,
the rebased version of the local edit will have its constraint violated.
This ought to leave the document in a state where A was deleted but B was not deleted.
In order to arrive at such a state from the local tip state
(where both A and B were deleted)
it is necessary to revive node B.

### User Undo

This is the more obvious use case:
undoing destructive operation requires the corresponding repair data.
See the [undo design document](./undo.md) for more details.

## Repair Data Stores

Repair data is computed by each client as they apply changes to documents.
For example, before deleting a subtree from the document,
the client first takes note of the data in that subtree so that it can revive it later if need be.
Until it is needed,
or until it can be discarded,
repair data is stored in a `RepairDataStore`.

Each of the three contexts in which repair data may be needed maintains its own repair data store:

### Rolling Back Local Transactions

Each transaction uses a repair data store to keep track of the data destroyed during the transaction.
This data is then pulled from the store when rolling back the transaction.
Note: this may change soon.

The repair data for transaction steps is discarded when the transaction is completed/aborted.

### Local Branch Updates

The local state manager uses a repair data store to keep track of the data destroyed by edits that have been applied locally but have yet to be sequenced.
This data is then pulled from the store when concurrent edits cause the local edits to be rolled back as part of rebasing.

The repair data for the local changes is discarded when the local changes are sequenced or rolled back as part of rebasing.

### User Undo

The `EditManager`, whose responsibilities include producing deltas in response to sequenced changes,
needs to use a repair data store to keep track of the data destroyed by sequenced edits.
This data is then pulled from the store to produce a delta when an undo edit is applied.

The repair data for an individual edit in the trunk is discarded when the corresponding edit falls outside of the [undo window](./undo.md).

## Characterizing Repair Data by Input Path

In order to store repair data in a repair data store and be able to fetch it later,
we need to establish a convention for unambiguously characterizing what data is being stored or fetched.

The convention we have opted for is to characterize each deleted node
(or deleted value on a node)
by the path of the node in the input context of
(i.e., the state prior to)
the change that deleted the node (or its value).

This has two consequences.

### Computing Repair Data Per Individual Edit

When first computing repair data for storage,
one must compute it for the individual edit that next applies to the tip state,
as opposed to computing it for a composed set of edits all at once.
This is because the input context of a composed set of edits is
different from the input context of the individual edits in the set
(except for the first edit in the set).

Depending on how much information was preserved in the composition of the edits,
it may be possible to work out the correct path of the deleted data for each edit in a composed changeset.
This would however be rather complicated,
and would place restrictions on how lossy the composition could be,
which in turn reduces the value of composing the edits in the first place.
For example, document nodes that were inserted by an edit and deleted by the next may need to be preserved as part of the composition of these two edits.

### Fetching Repair Data Before Rebasing

Inverse edits sometimes need to be rebased.
When that happens, the marks in the rebased changeset can shift to a different location.
If we were to query a repair data store based on the path of a changeset mark that has been shifted due to rebasing,
we would end up querying the store with the wrong path,
which could lead to no repair data being found,
or the wrong repair data being found.

We avoid this issue by querying the repair data store for repair data based on the original inverse change
(i.e., before any rebasing).

Another alternative would be to record the original path within the changeset mark for which we need to request repair data,
and use that path instead of the mark's path.
This would however make such changeset marks more computationally expensive.
It is tempting to think that such an approach would help avoid querying the repair data store for changeset marks that will end up being cancelled out.
This line of thinking however does not take into account the fact that we do not want to cancel out such marks.
For example, if a local change that deletes a node gets rebased,
the revival of the deleted node and its deletion by the rebased local edit may ultimately cancel out in the delta being sent out to update the application state,
but the repair data store needs to be updated to reflect that it is the rebased edit
that performed the edit
(which may now be occurring at different index).

## Characterizing Repair Data by Tip-State Path

This section documents an alternative way to characterize repair data.
As such, **this section does not reflect how the system works**.

Instead of characterizing repair data by its path in the document in the input context of the edit that deleted it,
one can characterize by it by its path in the document's current (i.e., "tip") state.

This makes some intuitive sense when considering that:

-   The tip state is the _lingua franca_ of the rebase process: concurrent changesets are constantly reframed in terms of the tip state in order to be applied.
-   The tip state forms the input context that inverse changes
    (for which repair data needs to be fetched)
    are applied to.
    See [Fetching Repair Data Before Rebasing](#fetching-repair-data-before-rebasing).

This approach however comes with some drawbacks:

-   The repair store data would need to be updated (effectively, rebased) in the face of changes to keep the repair data in sync with the tip state.
-   Representing the location of the repair data within the tip context requires a way to represent the position where the data would be if it were revived.
    In optional and value fields this would mean all the repair data ends up in the same "slot".
    In sequence fields the repair data would be represented as places with lineage in order to differentiate them.
    Looking up repair data for a sequence field would require having an efficient way to sift thought all those places.
    More generally speaking, this approach seems to require field-kind-specific code in order to characterize the repair data.
    It is plausible that whatever field-kind-specific code is needed to accomplish this is also the same code that is needed for anchor management, but that has yet to be confirmed.
    This may become clearer as we expand our anchor capabilities and make them field-kind specific.

## Additional Considerations

### Avoiding Step-by-Step Delta Application

When a peer edit is received by a client
the local state need to be updated to reflect that edit.
When the client has local edits
(i.e., edits that have been applied locally, but have yet to be sequenced)
updating the local state involves a combination of undoing the local edits,
applying the newly received peer edit,
and applying the rebased version of the local edits.
It is common for the rollback of the local edits to cancel out with the application of the rebased version of the local edits.
This leads to a delta that is minimal
(e.g., it doesn't involve inserting then deleting the same node).
Applications tend to prefer such minimal updates as it reduces the amount of update work that they need to perform.

Ensuring that we send minimal deltas to applications may seem at odds with the requirements outlined in
[Computing Repair Data Per Individual Edit](#computing-repair-data-per-individual-edit).
It need not be.
We can decouple the computation of the repair data from the computation of the delta,
the former being carried out per changeset and the later one per update.

### Abstract Repair Data

Repair data can exist in repair data stores, changesets, and deltas.
Ultimately, repair data is consumed by the application when applying deltas.

While we could encode repair data in the same concrete representation we use for inserted subtrees,
doing so may force the application to translate the repair data from its own encoding into this concrete representation,
only to translate it back into its own encoding when consuming the delta.
It therefore seems preferable to allow the repair data encoding to be application specific by default,
and only convert it to a concrete application-agnostic encoding when it needs to be sent over the wire
(e.g., in summaries).
This also allows for the repair data to be encoded as an opaque token that only the application code can match to document data.
This opaque token encoding simplifies the contract around repair data:
the token can be cheaply copied and it does not allow for the repair data to be read or mutated.

### Deleting Revived Data

It's possible for an edit to revive some subtree and delete a part of that same subtree.
When that occurs, it is necessary for the repair data associated with that changeset to include the deleted portion of the revived tree.

In such a scenario, we must be careful about how we characterize the repair data.
A naive approach may lead to the same path used to characterize different repair data.

For example, if a document contains a sequence of Point subtrees,
and an edit revives the Point at the start of the sequence,
then deletes the X node under the revived Point,
while also deleting the X node under the first Point in the sequence,
then the repair data for the deleted nodes may end up characterized as the same path ("points[0].x").

A possible solution may be to characterize repair data by its path after all nodes have been revived,
but before any nodes are inserted, deleted, or moved.
It may also be possible to simply track paths to deleted revived content separately
(e.g., using a boolean to indicate this special case).

### Computing Repair Data From Changes vs. Deltas

The advantage of computing repair data based on deltas as opposed to changes,
is that deltas are not coupled to the details of `FieldKind` individual field kind implementations.

In order to use deltas when computing repair data,
we must ensure they preserve all the necessary information.
This can be achieved by following two rules:

1. Do not compute repair data based on deltas that represent composed changesets
   (see [Computing Repair Data Per Individual Edit](#computing-repair-data-per-individual-edit)).
2. Do not apply deletions to revived subtrees as part of the change-to-delta conversion.

Interestingly, #2 is not possible if we follow the [Abstract Repair Data](#abstract-repair-data) approach.

### Repair Data Flow

While the [three contexts](#three-contexts) in which repair data exists operate independently,
it is interesting to consider how repair data effectively flows between them:

-   Repair data from a successful transaction is dropped along with the transaction's repair data store.
    Equivalent repair data is added to the local branch's repair store.
-   Repair data from a local edit that gets rebased is dropped from the local branch's repair store.
    Repair data from the rebased version of that local edit is added to the local branch's repair store.
-   Repair data from a local edits that is sequenced is dropped from the local branch's repair store.
    Equivalent repair data is added to the trunk's repair store.
-   Repair data from a sequenced edit is dropped from the trunk's repair store when that edit falls outside of the undo window.

It is tempting to build efficient pathways for the repair data flow from one repair data store to the next without being fully re-computed:

-   A more direct transition of the repair data from the transaction to the local branch is currently impractical because the repair data of the transaction is based on a sequence of atomic changes instead of the unified changeset that makes it to the local branch.
    Future iterations of the transaction code may remove this barrier but may also remove the need for repair data in the transaction code altogether.
-   The repair data that flows out and back into the local branch repair data store as local edits get rebased may be hard to optimize because the repair data of the rebased edit may be subtly different from that of the non-rebased one.
-   A more direct transition fom the local branch store to the trunk store seems possible.
