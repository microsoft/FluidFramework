# Detached Trees

## What are Detached Trees?

SharedTree allows users to generate edits that remove or overwrite nodes from the document.
While these edits seem destructive, they do not actually erase the node and the data associated with it and its descendants.
Instead, the node is moved out of the document tree, and treated as a new root that stands apart - detached - from the document.
This keeps the contents of the removed subtree in the forest instead of erasing them.

## Does This Lead to Unbounded Memory Growth?

Keeping all detached trees forever would lead to unbounded memory growth in clients,
and would run the risk of seriously bloating the document's snapshot size.
In order to avoid that, we intend to
(this is not implemented at the time of writing)
garbage-collect detached trees.
How this happens is covered further down,
but the key idea is that most of our systems are allowed to ignore the existence of this garbage collection scheme,
thereby making those systems' contracts and implementations simpler.

## When Are Detached Trees Relevant?

Detached trees are needed when a removed tree's contents
(i.e., the contents of the now detached tree)
become relevant again.
There are four scenarios where this can happen:

-   Reverting a commit
-   Aborting a transaction
-   Rebasing a local branch
-   Applying a rebased commit

### Reverting a Commit

This is the more obvious use case:
reverting a remove or overwrite operation requires the corresponding tree that was removed or overwritten.
See the [undo design document](./undo.md) for more details.

### Aborting a Transaction

When a client needs to edit the document, it can do so in a transaction.
Transactions are allowed to return a special value to communicate that the transaction should be aborted.
When that happens, any edits that the transaction had already applied to the document state need to be rolled back.
If some of those edits removed nodes, then those nodes need to be reintroduced into the document tree.

### Rebasing a Local Branch

When a client performs a local edit,
it updates the local document state to reflect the impact of this edit,
and it sends the edit to the service for sequencing.
Under ideal circumstances, the next edit that the client receives from the service is that same edit that it had applied locally and sent for sequencing.
If that's the case, the client does not need to update the document state.
It's possible for an edit from a peer to be sequenced before the edit that was applied locally and sent out.
When that happens,
the local client needs to update the document state to reflect not only the impact of the edit from the peer,
but also the impact that the peer edit has on the local edit.

Consider the following example:

-   Local edit: Remove node B iff node A exist.
-   Peer edit: Remove node A.

If the peer edit is sequenced before the local edit,
the rebased version of the local edit will have its constraint violated.
This ought to leave the document in a state where A was removed but B was not removed.
In order to arrive at such a state from the local tip state
(where both A and B were removed)
it is necessary to restore node B.

### Applying a Rebased Commit

Another case where the contents of a removed tree can be relevant is when we need to apply a commit that edits those contents.
While we don't currently support the creation of edits to already removed trees,
any edit may be rebased over the removal of one of its ancestors,
thereby making the edit target the removed tree.
In order to apply such an edit, we need access to the contents of the removed tree.\*

\* Strictly speaking, this is only true for edits that would move contents out of the removed tree and into the document tree.
All other edits could be ignored since the user has no way of seeing their impact.

## Why Design It This Way?

### Merge Semantics

We have adopted merge semantics that allow edits to affect removed trees.
This means removed trees are still part of the shared document that is being edited,
even if they are not part of the document tree at all times.
Keeping removed trees around in the forest is aligned with this view.

### Performance

One alternative,
(i.e., eagerly erasing the contents of subtrees that are removed)
would force us to have ways of recovering this data when needed.
One such approach would be to require that removal operations include a copy of the contents they remove/overwrite.
For example, every time a client sets a required field,
that client would include a copy the replaced subtree as part of the edit sent over the wire.
This is bad from a performance point of view because it adds a cost common operations even though that cost my never be recouped.

Another alternative would be to keep all detached trees forever
(i.e., without garbage-collecting them).
As mentioned above, this would be bad for memory usage
(though that could be addressed using local disk storage)
and document load.

### Simplicity

The fact that most of our system gets to assume all trees exist forever makes the system simpler.
There is a non-negligible complexity cost associated with the GC scheme,
but this complexity is contained in a relatively small body of code that exists only for this purpose.

### Evolvability

This design seems well positioned to accommodate future evolutions like the concept of [undo window](undo.md).

## How it Works

### Identifying Detached Trees

Whenever we need to edit or restore a detached tree,
we need to be able to describe which specific detached tree is impacted.
This is true in three different layers of our system:

-   Changesets
-   Deltas
-   Calls to `Forest` and `AnchorSet`'s `DeltaVisitor`s.

Trees (subtrees) that are in the document are identified by their path from the document root.
Detached trees however are not reachable from the document root, so they need to be identified though a different scheme.
What that scheme is used varies depending on the layer.

#### In Changesets

One key requirement for identifying detached trees in changesets
is that peers need to use a globally consistent identification scheme:
if two peers concurrently send edits that affect detached trees,
the rebaser needs to be able to detect whether these edits target the same detached tree or not,
and if so, rebase one over the other.

In changesets
(which are sent over the wire and rebased)
we `ChangeAtomId`s to identify each detached tree that is relevant to the change.
In a given context, there is only one `ChangeAtomId` associated with a given detached tree,
and no other detached tree is associated with that `ChangeAtomId`.
The specific `ChangeAtomId` that is associated with a given detached tree is dictated by the changeset that detached the tree.
Since (thanks to rebasing) all clients share a consistent view of changesets,
they therefore derive a consistent view of the detached trees' associated `ChangeAtomId`s.

#### In Deltas

Deltas use `DetachedNodeId`s to identify detached trees.
These are simply a copy of the `ChangeAtomId`s used the changesets.

Deltas do not have the same global consistency requirement as changesets:
If some client A could use `DetachedNodeId` X to refer to tree Foo,
some other client B could refer to the same tree Foo using some different `DetachedNodeId` Y,
and could use the same `DetachedNodeId` to refer to a different tree Bar.

A single client does however need to be internally consistent:
There must be a 1:1 correspondence between a detached tree and a `DetachedNodeId`,
and that correspondence must be consistent over time.
For example, if a newly detached tree is associated with a given `DetachedNodeId`,
then the next operation that affects the tree will refer to it using the same `DetachedNodeId`.

The consistency guarantees offered by the `ChangeAtomId`s used to identify detached trees in changesets are sufficient for the purpose of Deltas,
which is why `DetachedNodeId`s are a straightforward copy of `ChangeAtomId`s.

#### In `DeltaVisitor` Calls

The `Forest`, `AnchorSet`, and `DeltaVisitor` abstractions do not feature the concept of detached tree.
At this layer, we identify detached trees using a path that starts in a detached field.
We may decide to force these abstractions to adopt the concept detached tree in the future if we see a benefit.

The current approach has the following consequences:

-   The contracts and implementations for these abstractions remains smaller/simpler.
-   Some translation layer is needed between `DetachedNodeId`s and these paths.

The translation from a `DetachedNodeId` to path in a detached field is handled by the `DetachedFieldIndex`.

### The `DetachedFieldIndex`
