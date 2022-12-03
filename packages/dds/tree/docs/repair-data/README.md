# Repair Data

## What is Repair Data

In order to undo a edit `e` that was applied to state `s1` and yielded state `s2`,
we need to contract an inverse edit `e⁻¹` that yields state `s1` when applied to state `s2`. Computing `e⁻¹` requires the following information:

-   The original change to be undone
-   Any document state that we wish to restore as part of the undo,
    but cannot derive from the the original change.

This last bullet point may not be immediately obvious,
but it is a critical issue.
We may need to recover information about the state of the document before the change that we wish to undo
because changes can be destructive:

-   Setting the value on a node loses information about the prior value of that node.
-   Deleting a subtree loses information about the contents of that subtree.

Such data cannot be derived solely from the original changeset to be undone.
We refer to the information that is needed in addition the original changeset as "repair data".

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
and it send the edit to the service for sequencing.
Under ideal circumstances, the next edit that the client receives from the service is that same edit that it had applied locally and sent for sequencing.
If that's the case then the client does not need to update the document state.
Due to concurrency, it's possible for an edit from a peer to be sequenced before the edit that was applied locally and sent out.
When that happens, the local client needs to update the document state to reflect not only the impact of the edit from the peer,
but also the impact that the peer edit has on the local edit.

For example, if a the local edit was deletion of two nodes A and B, with a constraint that both nodes must exist,
and the peer change had deleted node A, then the net impact of the peer change is that node B ought to be revived.

### User Undo

See first section.
Also, see the [undo design document](../undo/README.md).

## Repair Data Stores

Repair data is computed by each client as they apply changes to documents.
For example, before deleting a subtree from the document,
the client first takes note of the data in that subtree so that it can revive it later if need be.

Each of the three context in which repair data may be needed maintains its own repair data store:

### Rolling Back Local Transactions

Each transaction uses a repair data store to keep track of the data destroyed during the transaction.
This data is then pulled from the store when rolling back the transaction.

The repair data for transaction steps is discarded when the transaction is completed/aborted.

### Local Branch Updates

The local state manager uses a repair data store to keep track of the data destroyed by edits that have been applied locally but have yet to be sequenced.
This data is then pulled from the store when concurrent edits cause the local edits to be undone.

The repair data for the local changes is discarded when the local changes are sequenced or rolled back as part of rebasing.

### User Undo

The trunk state manager uses a repair data store to keep track of the data destroyed by sequenced edits.
This data is then pulled from the store when an undo edit is applied.

The repair data for an individual edit in the trunk is discarded when the corresponding edit falls outside of the [undo window](../undo/README.md).

## Characterizing Repair Data by Input Path

In order to store repair data in a repair data store and be able to fetch it later,
we need to establish a convention for unambiguously characterized what data is being stored or fetched.

The convention we have opted for is to characterize a deleted node
(or a deleted value on a node)
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

TODOOOOOO

## Characterizing Repair Data by Tip-State Path

TODOOOOOO
You have to keep it updated as new edits come in.

Representing the location of the repair data within the tip context requires a way to represent the position where the data would be if it were revived. In optional and value fields this would mean all the repair data ends up in the same "slot". In sequence fields the repair data would be represented as places with lineage in order to differentiate them. Looking up repair data for a sequence field would require having an efficient way to sift thought all those places. More generally speaking, this approach seems to require field-kind-specific code in order to characterize the repair data. It is plausible that whatever field-kind-specific code is needed to accomplish this is also the same code that is needed for anchor management, but that's not clear at this time. It may become clearer as we expand our anchor capabilities and make them field-kind specific.

## Extra Details

### Avoiding Step-by-Step Delta Application

Decouple the computation of repair data from the computation of the delta (and its application).

### Late Repair Data Concretization

TODOOOOOO

### Deleting Revived Data

It's possible for an edit to revive some subtree and delete a part of that subtree.
When that occurs, we need the repair data stored for that changeset to include the deleted portion of the revived tree.

In such as scenario, we must be careful about how we characterize the repair data.
A naive approach may lead to the same path used to characterize different repair data.

For example, if a document contains a sequenced of Point subtrees,
and an edit revives the a Point a the start of the sequence,
then deletes the X node under the revived Point,
while also deleting the X node under the first Point in the sequence,
then both deleted nodes will have path "points[0].x".

A possible solution may be to characterize repair data by its path after all nodes have been revived,
but before any nodes are inserted, deleted, or moved.

### Computing Repair Data From Changes vs. Deltas

The advantage of computing repair data based on deltas as opposed to changes,
is that deltas are coupled to the details of `FieldKind` individual field kind implementations.

In order to use deltas when computing repair data,
we must ensure they preserve all the necessary information.
This can be achieved by following two rules:

1. Do not compute repair data based on deltas that represent composed changesets
   (see [Computing Repair Data Per Individual Edit](#computing-repair-data-per-individual-edit)).
2. Do not apply deletions to revived subtrees as part of the change-to-delta conversion.

Interestingly, #2 is not possible if we follow the
[Late Repair Data Concretization](#late-repair-data-concretization)
approach.

### Repair Data Flow

TODOOOOOO
From local to trunk: yes, upon sequencing of the local edits.

From transaction to local: actually no, because of granularity.
