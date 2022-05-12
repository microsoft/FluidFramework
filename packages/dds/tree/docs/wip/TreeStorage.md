# Tree Storage

This document assumes that the trees will be persisted into some copy on write storage in the form of blobs, which can be fetched using their "handle" which can in turn be serialized into blobs.
This is the API of Fluid's blobs, but note that fluid requires you to upload the blob to be able to serialize a handle to it.

It is assumed that each client has access to some stored version of the tree, and keeps the "dirty" part in memory.
It is not required that all the clients agree on what stored tree they are using, or how its chunked: all thats required to be be kept consistent is their understanding of its content.

## What Gets Stored

* The current tree.
* Optional "local" history information (information stored on/withing the logical tree about history for that specific subtree.
    This mostly makes sense for structural edits, but could point to or include high level edits/transaction information).
* Optional references to old snapshots (ex: sequence of top level snapshots. How file system snapshots work).
* Optional top level edit sequence (log of ops. Could be temporal history and/or logical branch history. Can include high level edit information)

For the rest of this document we will ignore storage of old snapshots, and any history sequence stored at the top level, and focus just on the actual tree content.
This tree content could be just the tree data, or the tree data augmented with history information (ex: sequences of deltas, references to edits etc): we will treat these the same.

## Storage Approaches

### Logical Node Tree

The actual tree itself can be stored directly, with each node being a blob, and referring to each other node with a handle.
This would perform very poorly when used with fluid's blobs being pulled over the network due to:
- poor per node storage efficiency (pay full blob cost (including storing a handle in the parent) for every node)
- lots of dependent reads when traversing down (depth of logical tree)
- large sequences can produce large blobs (since a single node won't be split ever)
- updates have to create O(depth) blobs, which depend on each-other (and this with fluid have to be uploaded in sequence)

This does have some nice properties:
- Accessing a child from its parent is always exactly 1 handle dereference.
- When walking a sequence, siblings can be prefetched.
- It's very simple and easy to implement correctly.

Some useful performance trad-offs that could be made to improve this:
- Inline some nodes instead of storing them in separate blobs.
    Choice of which nodes to do this with impacts performance a lot and depends on usage.
    Could include choice with schema and/or usage information (both hard coded heuristics and dynamically).
- Could indirect some (or all) blob references through an indirection table (PageTable by page Id) to reduce propagation of updates ancestors.
    - Choice of when to do this could be heuristic tuned to balance read costs, page table memory use, and write costs.
    - Can be used where depth (by number of blobs) since last indirection is high, and/or right above blobs that keep getting updated (ex: add an indirection when updating multiple parent blobs for the sole purpose of updating a specific child tht keeps changing).
    - Page ids for indirect references can be allocated such that nearby pages tend to sort near each-other improving efficiency of caching nodes in indirection B tree.
    - Can rewrite parts of the tree removing or changing indirection (and possibly re-chunking). Doing this occasionally for parts of the tree that were loaded but not modified can ensure read heavy parts of the tree have a chance to get optimally re-encoded for reading.
- Chunk sequences: when listing the children in a sequence, allow referring to a "Chunk" which can contain multiple nodes (potentially via sub-chunks) instead of just directly to nodes.
    This allows splatting up large sequences for more efficient editing and avoiding bloated blobs due to large sequences.
    It also allows clustering similar siblings together for improved compression, which works particularly well when combined with inlining of their children.
    This also makes it easier for the root to be a sequence instead of a node, which may benefit the editing APIs.
- Chunked sets of traits:
    When there are very many traits so the fields list, even with one chunk per trait, is too big for the blob, of there are several traits with small subtrees that should be inlined, but they can't all fit,
    it can be useful to split up the list of traits into chunks (or even a tree).
    This can easily be done by organizing them into a sorted tree (ex: B-Tree) by field key.

These optimizations interact: for example if inlining to optimize breadth first traversal,
the depth of the tree of blobs will tend to be as high as the logical tree's depth, so indirection on blob handles will be more useful.

For N nodes, if 1 in 20 blobs handles were randomly indirect, and we fit average of 100 nodes in a blob, and the indirection b-tree is branching factor 200 (4KB pages, 20 byte handle) we get:
    - N / 100 blobs
    - N / 2000 indirect blob references
    - log(200, N / 2000) deep indirection table. (First page gets us to 400k nodes, 4 deep covers 3.2 trillion nodes)
    - on average traversing an edge between nodes does 1 / 100 + log(200, N / 2000) / 2000 handle dereferences (assuming nothing is cached). (For 1M nodes, thats ~0.01)
    - 40 bytes per node in main tree
    - ~0.01 bytes of indirection table per node
    - average pages updated on single change: ~20 (This might be acceptable if we batch updates, only writing batches when summarizing, since that would deduplicate a lot of intermediate updates. Also optimizing where indirection is used (instead of random) would also help a lot here).

Same states with every handle indirect:
    - N / 100 blobs
    - N / 100 indirect blob references
    - log(200, N / 100) deep indirection table. (First page gets us to 20k nodes, 4 deep covers 160 million nodes)
    - on average traversing an edge between nodes does 1 / 100 + log(200, N / 100) / 100 handle dereferences (assuming nothing is cached). (For 1M nodes, thats ~0.027)
    - 40 bytes per node in main tree
    - ~0.2 bytes of indirection table per node
    - average pages updated on single change: 1 + ceil(log(200, N / 100)). Thats 2 upt to 20k nodes, 5 for 160 million.

### Path B-Tree

All data in the tree can be stored in a key value store under it's full path through the logical tree.
Doing this with a [Radix tree](https://en.wikipedia.org/wiki/Radix_tree) roughly amounts to storing the logical tree.
Rather than directly doing a Radix tree, a B-Tree can be used, which can be optimized by duplicating the common prefixes within the nodes to get storage costs closer to the radix tree.
Without this compression, trees with small values would be almost entirely "keys", as the paths would usually exceed the the size of the values.

For this approach, its important how the paths are defined as well as how they are encoded. For example for paths into sequences, if the index in the sequence is used, inserting a sibling near the root can change the paths of almost everything in the tree.

Some possible optimizations:
- Omit the leading parts of the paths in the nodes lower in the tree, inferring them from the traversal (radix tree style). This makes moves (and inserts which change indexes in paths) often able to reuse b-tree nodes as is.
    This can however require storing extra data in interior nodes when moving children between parents and/or regenerating the children to to account for the parent providing a different portion of the path, when just doing operations like splitting nodes for balancing.
- Model sequence indexes such that inserts usually don't have to change the indexes of other nodes in the sequence (ex: allow inserting at 2.5, instead of moving everything above 3 over one and inserting at 3). As long as the keys still sort in the right order, it should work fine, but can result in keys getting longer. May involve occasionally normalizing the indexes in a sequence to shorten indexes where inserts keep happening.
- Subtrees could be used as values in the tree instead of just the leaf values, allowing some more opportunity for schema based compression, or other compression schemes.

TODO: this section needs a better understanding of how to avoid storing full paths all over while allowing tree balancing, inserting which changes sequence indexes, and moves without updating the paths within the moved subtrees.
This is all interrelated, and I don't have a great solution fully in my head: I may be over or under estimating the complexity and efficiency of a solution.

### Node Identifier B-Tree

Give all nodes a unique identifier, and refer to them using this identifier.
This is the approach used by experimental shared-tree.
Can be optimized using id-compression and the chunking scheme prototyped in https://github.com/CraigMacomber/sequence.

This approach does poorly for sequences that have been reordered since that forces the B-Tree to have more entries due to not having chunks which cover contiguous ID space.

This chunking approach can avoid a lot of the indirection costs, and sequential id allocation can help keep access in the B tree using nearby keys a lot of the time,
but in general it can end up pulling down lots of B-nodes when trees fail to have well clustered IDs, which can happen due to editing.
Due to this overhead, this design isn't considered in the sceneries below, and is mainly included for comparison.
This design works decently for in memory storage, but doesn't page in/out data very well since a lot of the data in the pages will be data thats not needed for the part of the tree thats being used.

## Example Sceneries

### Deep Tree

Consider a tree with N nodes where its depth is O(N).

This makes the path to the leaves, and thus the size of the key in the Path B-Tree O(N).

TODO: what would this means for the Path B-Tree? In practice this has to account for how it optimizes storage of paths.

In the logical tree case, its O(N) space, and assuming use of some indirection, O(N) log (N) time to visit the whole tree.
Inlining can be used to get good sizes for the blobs, and indirection can be used occasionally to lower its costs by a constant factor.

### Walking a long sequence high up in a large tree

Read a small amount of data out (the type and position of items in a whiteboard) of many large subtrees.

This could hit most of the interior nodes in a Path B-Tree because it would be reading data thats spread out pretty uniformly though the key-space.
This seems like a worst case access pattern for Path B-Tree, but at least its in order so the occasional dependent reads when traversing down multiple levels in the B-Tree can be efficiently amortized, and older pages can be freed from memory without getting re-downloaded later in the traversal.

The Logical Tree approach could theoretically chunk the data to handle this case nearly optimally.
The question is how close to that would be expect it to get in practice since it needs to optimize for many usage patterns, not just this one.
Simple heuristics, like always inlining the type, and tending to inline small subtrees that always have the same shape (like the position) could work well here, though there is a balance between inlining small subtrees causing the size of nodes in the chunk to be larger, resulting in the top level sequence having more chunks.
There are thus two extremes where this could go badly:
1. Too much inlining, causing each node in the sequence to be in its own chunk. At least these chunks could be prefetched for the upcoming children.
2. Too little inlining: the information we need from the node is not available in the chunks that make up the sequence, thus for each node we have to fetch its chunk. When reading the content of that chunk, we could even have to fetch another chunk for the position if it also wasn't inlined (ex: lots of other data got inlined filling up the chunk)


### Comparison Notes

The Path B-Tree has very simple chunking logic and can easily produce nicely sized blobs.
It pushes the complexity onto how to store and update the keys.

The Logical Node Tree approach, when applying good chunking heuristics, has much more complex chunking logic (has to handle large numbers of fields, long sequences, inlining etc),
the management of the underling tree of blobs it uses is very simple.

The logical tree approach is well suited to applying contextual optimizations, for example it can easily be made extensible with a sequence chunk abstraction, allowing for specialized encoding and compressions schemes to be used where appropriate.
Such specialized approaches and tuning of heuristics can optionally consume schema data, as well as usage patterns to have blob boundaries converge where edits happen, reducing redundant storage and updates over time.
It would be relatively easy to produce a minimal version of the logical tree approach and add optimizations incrementally in the future, even maintaining document compatibility.

Thus it seems like the logical tree provides modular way to add tuning/optimization allowing incremental delivery of target optimizations, though that comes at the cost of needing more optimizations to reach a good baseline performance.
The Path B-Tree provides a elegant and simple approach, but opportunities to optimize it interact with the tree structure itself (ex: key/path storage, and dealing with moves),
and would be impractical to optimize some parts of it for specific access patterns, like breadth first traversals of specific large sequences.

While both approaches could permit optimized formats for the leaf subtrees, this fits more naturally into the logical tree, which can do this for non-leaf subtrees as well, and never has subtrees split in a way that requires climbing up the tree to find children: the needed chunks for subtrees are always directly references, or indirectly referenced via the indirection table. While use of the indirection table can behave similar to when finding children requires walking up the Path B-Tree, its different in that the indirection table likely has worse locality, but is Op-in can can thus be only used where it provides values (And is a standalone system which makes it easier to reason about and test compared to integrated in the path B-trees key handling).

#### Finding parents and identifier indexes

In both cases, you use a path to a node to find it so its parents are found on the way.

However if we add an index that allows finding nodes by some other query path (ex: an index by node identifiers for nodes which have an identifier), there are a few ways that can work.
If the index maps identifier to path, then the index is expensive to update for large subtree moves.
If for logical trees, if the index maps identifier to blob (or page id indirectly pointing to blob), this can avoids large update costs for moves, but needs another index (page to parent) to be able to discover parentage of nodes looked up this way.

TODO: this seems like it would also be true for path b-tree, but this needs checking: depends on how paths are compressed in the tree.
