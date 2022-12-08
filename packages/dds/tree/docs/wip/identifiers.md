# SharedTree Node Identifiers

## Why Identifiers

Why use identifiers at all?
SharedTree has paths, are not those already sufficient "references" or "handles" to nodes in the tree?
No, a node's identifier is related to, but not the same thing as, the path to that node in the tree.
A path points to a location within a tree, but it does not necessarily capture any semantic meaning about the identity of the node it points to.
Consider a node A which is deleted, and then consider a node B which is inserted in the same place.
Node A and Node B have the same path (although they are in different revisions) but they are not the same node;
they should therefore not share the same identifier.
Likewise, consider a node A which is moved from location X to location Y in the tree.
Node A has a different path after the move than it did before, but semantically it is the "same node";
it should have the same identifier in both locations.

## Proposal Overview

Identifiers are stored under nodes in fields.
A SharedTree has an optional index, the IdentifierIndex.
The IdentifierIndex allows a user to provide an identifier and retrieve an anchor to a node with that identifier.
An identifier is a special type (a numerically compressed node identifier).
The index maintains a mapping from each identifier to a path.
The index is parameterized over a field key, e.g. "identifier", and will consider all nodes that have this field to be identified by the data in that field.
That data ought to be an identifier; if it is not, the index can either ignore it or fail.

## Updating the Index

Like all indexes, the IdentifierIndex can be serialized and rehydrated.
When a SharedTree loads a document, the IdentifierIndex loads its last serialized state.
From then on, it computes its subsequent states by examining each operation:

* Insert: The tree being inserted is fully traversed in a search for identifier fields.
  Any that are found are added to the index. If other indexes are also traversing the tree for their own purposes then it might make sense to have SharedTree provide a single traversal that the indexes can hook into, rather than having each index do its own walk.
* Delete: The tree being deleted is fully traversed in a search for identifier fields.
  Any that are found are removed from the index. For a large, virtualized tree this might require downloading parts of the tree that haven't been loaded yet;
  therefore, updating the index after a delete becomes an async operation.
  There may be alternative strategies; for example, the API could remain synchronous if the index could allow the removal of the identifiers to run asynchrounously in the background.
  Then, for each identifier query, the index validates that the mapping it has is still valid by looking up the node in a ForestIndex by its path and then checking that its identifier matches the one in the index.
  Or, depending on the internal data structure used by the index, it might be able to tombstone the deleted entries efficiently while they are removed.
* Move: The tree being moved is fully traversed in a search for identifier fields.
  Any that are found are updated with new paths in the index.
  This has similar requirements to delete, just above.
* Set Value: If the value being set is an identifier, it must update the index.
  This case is not necessary if identifier fields are required to be readonly (and can therefore only be introduced during inserts).

## API

1. An API for querying a node by identifier, e.g. `find(id: CompressedNodeIdentifier): Anchor | undefined`.
   Higher level reading APIs (like EditableTree) would wrap this for their own purposes, although I don't think there is a way to guarantee the type of the resulting node at compile time, even in a context that is schema aware.
   This API presents the IdentifierIndex as a covering index;
   it might be useful to also expose the inner `findPath(id: CompressedNodeIdentifier): UpPath | undefined` so it can be used as a non-covering index as well.
2. APIs for updating the contents of the index, e.g. `set(id: CompressedNodeIdentifier, path: UpPath)`, `delete(id: CompressedNodeIdentifier)`, and perhaps `move(id: CompressedNodeIdentifier, path: UpPath)`
3. `summarize` and `load`
4. Events, e.g. `identifierRecorded` and `identifierDeleted`.

The API in #1 would be exposed at a higher level by the SharedTree.
APIs in #2 would be used internally by SharedTree.

## Representation

Looking up a node by identifier would be a two step process of first getting the path for that indentifier, and then using the path to query the forest for the node.
For many scenarios, it would be sufficient to implement the IdentifierIndex as a simple javascript map, e.g. `Map<CompressedNodeIdentifier, UpPath>` or `Map<CompressedNodeIdentifier, string>`.
However, there are a couple constraints which make that insufficient.

* The index might grow very large, and need to be chunked and virtualized.
* A user might want to query the index as it was at different revisions, e.g. because they have a snapshot-isolated transaction from which the current state of the tree has diverged, or they have history turned on.

These requirements make a strong case for a virtualized b-tree.
In the short term, before we provide support for larger-than-memory documents, we can use a copy-on-write B-tree.

### Caching

The index could employ an ephemeral, in-memory cache of `identifier -> node` to skip the cost of looking up paths in the forest for repeat reads.
However, if `node` is an `Anchor`, as proposed above, then it's unclear how to manage the lifetime of anchors living in the cache.

### Forest

The IdentifierIndex may or may not require a ForestIndex; this is still being researched. A ForestIndex would allow the asynchronous deletion strategy highlighted above for [deletes](#updating-the-index) (but other deletion strategies might be possible). It could also improve the API, because the IdentifierIndex could return Cursors instead of just Anchors or paths.

One significant consideration is that if the IdentifierIndex doesn't depend on the ForestIndex, then it _must_ summarize its state in order to remain query-able across sessions. If it _does_ depend on a ForestIndex, then it doesn't necessarily have to summarize any state at all; it can always derive its state from the ForestIndex.

It would be possible to implement a simpler IdentifierIndex that depends on the forest, and implement another one later that does not depend on the Forest. It seems likely in the short term that any customers who want an IdentifierIndex also want a ForestIndex.

## Identifiers in Trees

### Field Compression

When compressed chunks are designed and implemented for both memory and storage, the cost of storing the identifier as a field on each node should not be meaningfully greater than any other way of storing the identifiers.
However, compressed chunks will likely not be completed by MParity.
Documents with many identifiers will incur a significant cost for having an extra node for every identifier.

One way to improve this is by giving identifiers their own FieldKind.
This might make it easier to do some kinds of compression or analysis and it would implicitly prevent some silly situations like giving an identifier an identifier.

If a FieldKind is not sufficient to provide good performance, then a temporary compromise would be to hardcode an identifier property on each node object and ensure it is serialized along with the other node data (e.g. the type property).
The API would remain the same, but there would be a temporary kludge which checks if the field being set matches the identifier key, and if so, puts this special property directly on the node.
Likewise, when reading a field, the special inlined identifier property is returned if the key matches.
When SharedTree's compression scheme is fully realized, it can switch to the non-kludge codepath for writing, but continue to read both schemes.
This would allow for a fully backwards compatible rollout and even a forwards compatible rollout (if it's deemed acceptable for old clients to take the perf hit of identifiers from newer clients no longer being inlined).

### Elision

Identifier elision is an important optimization for newly-inserted trees.
It is common that all the (numeric and compressed) identifiers given to nodes in a new tree were generated sequentially and can therefore be expressed as a range rather than putting every identifier on every node.
The best compression happens when every node in the inserted tree has an identifier (as was always the case in the legacy SharedTree), because a single range (or offset and count) is sufficient to communicate the identifier of every inserted node.
When identifiers are optional, it's not quite as easy, but it is still much better than no compression.
Consider a subtree tree with eight nodes which is inserted into the SharedTree.
Half of the nodes have identifiers:

Node | Identifier
-----|-----------
A    | `42`
B    | `43`
C    | none
D    | `44`
E    | none
F    | none
G    | `45`
H    | none

The presence of IDs could be represented as a binary number `11010010` and in hexadecimal as `D2`.
So the whole range here could be encoded as `[42, D2]` rather than `[42, 43, null, 44, null, null, 45, null]`.
This isn't necessarily an optimal encoding but demonstrates that compression is feasible and beneficial even with optional identifiers.

## Further Generalizations

There are a few ways to make the system even more general.

* Identifiers can be lazy and/or mutable.
  This should work as long as the index is updated (see the "Set Value" case under [Updating the Index](#updating-the-index) above).
* Identifiers could be stored under multiple different special field keys.
  The index could be parameterized over multiple different keys and could add a `key` field to the query API.
  Or, SharedTree could simply maintain multiple IdentifierIndexes that are each given a different field key to care about.
  The former approach is more efficient in the scenario where many nodes have multiple identifiers from different keys (i.e. there is a lot of "overlap"),
  but it potentially makes the API redundant (because you have to specify the key during each query) for what I think is the common case for apps: a single kind of identifier.
* Identifiers can be non-unique.
  Multiple nodes can have the same identifier within the same revision.
  This would be possible by having the index map each identifier to multiple nodes, but it would also make the API more general and perhaps unwieldy (returning lists of nodes/anchors rather than a single node).
  I think this one should have a strong justification and use case before we seriously consider it.

## Next Steps

1. Create a new FieldKind for identifiers.
2. Create the IdentifierIndex interface.
   It will be split into two variants, a "synchronous" one and a "async allowed" one:
    * The synchronous version guarantees the entire contents are held in memory (it fails if tree is too big).
      It exposes synchronous identifier -> Path/Anchor query API(s).
    * The asynchronous version has an asynchronous API which will download parts of the index to complete queries if necessary.
      It could also expose a synchronous API, but it's not clear what that API should do when the identifier is not in the tree. Fail, or return undefined?
3. Implement a synchronous identifier index that holds everything in memory.
   The first pass at the internal representation will be just a hashmap or off-the-shelf b-tree.
4. Expose the public-facing identifier query API on Checkout, so that users of SharedTree can query it.
5. Validate interfaces and architecture.
   Write tests.
