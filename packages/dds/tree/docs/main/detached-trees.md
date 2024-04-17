# Detached Trees

> Note: in the past, the term "repair data" has been used to refer to detached trees because of the role they play in undo/redo.
> The more general term "detached trees" is preferred because said trees are sometimes needed outside of undo/redo scenarios.

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

This design seems well positioned to accommodate future evolutions like the concept of [undo window](undo.md) and partial checkouts
(because of the refresher system).

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

The `DetachedFieldIndex` is used primarily by the `visitDelta` function to translate `DetachedNodeId`s to paths.
Its core responsibilities are as follows:

-   Picking a path where a newly detached tree (associated with a specific `DetachedNodeId`) should be stored
-   Checking if a specific detached tree (`DetachedNodeId`) has an assigned path,
    and if so, recalling what that path is.

#### A Naive Scheme

In theory, the conversion from `DetachedNodeId`s to paths could be a trivial one:

```typescript
function detachedNodeIdToPath(id: DetachedNodeId): UpPath {
	const parentField = `detached-${id.major}-${id.minor}`;
	return { parent: undefined, parentIndex: 0, parentField };
}
```

While this would work, it has the following drawbacks:

1. The overhear per detached tree may be prohibitive in scenarios (like text editing)
   that lead to a large number of small detached trees,
   because the `Forest` would have to store a string of the form `detached-<major>-<minor>` for each detached tree.
2. It assumes we are able to dictate to `DeltaVisitor`s (specifically, to `Forest`s) how they should identify detached trees.
   This is not currently an issue because we do have that ability,
   but it is possible we will want to allow `Forest`s to have their own (more efficient) scheme for identifying them.
   This point is weak on its own, but it provides an incentive to pick an approach that,
   on top of addressing point 1, also addresses it.

#### The Current Scheme

The scheme used by our actual `DetachedFieldIndex` implementation involves the introduction of a new kind of identifier: `ForestRootId`.
`ForestRootId`s act as a indirection layer between (and has 1:1 relationship with) a detached tree's `DetachedNodeId` and its corresponding path in the `Forest`:
for a specific detached tree, one can map its `DetachedNodeId` to a `ForestRootId`, and map that `ForestRootId` to the detached tree's path in the `Forest`.

`ForestRootId`s are incrementing consecutive integers that are picked by the `DetachedFieldIndex` when it is made aware of new detached trees.
The actual detached tree path for a given `ForestRootId` is derivable from that `ForestRootId` alone.

The fact that `ForestRootId`s are (typically) small integers makes them cheap to store.
The fact that `ForestRootId`s are consecutive makes them well suited to run-length encoding.
Finally, the fact that `ForestRootId`s are otherwise arbitrary prepares us for the possibility that `Forest` could be picking them in the future.
It also entails that the arbitrary mapping from each `DetachedNodeId` to their corresponding `ForestRootId`
must be maintained in the `DetachedFieldIndex` and included in summaries.

The indirection layer that `ForestRootId`s provide affords `DetachedFieldIndex` some freedom in how to organize the mapping between `DetachedNodeId`s and `ForestRootId`s.
This allows `DetachedFieldIndex` to pack more than one detached tree in the same detached field.
This makes representing detached trees in the forest more efficient because the cost of storing the detached field's key is amortized over all the detached trees stored under it.
In principle, `DetachedFieldIndex` could store all detached nodes under a single detached field,
but doing so would make the mapping from `DetachedNodeId` to `ForestRootId` very complex,
and likely less compact to represent in memory and in summaries.
Where the sweet spot lies depends on editing patterns and we will do our best to approximate according to usage data,
and if usage data suggests it is worth the engineering effort.
The crucial point is that we have encapsulated that concern in the `DetachedFieldIndex` and are able to revisit its implementation details.
