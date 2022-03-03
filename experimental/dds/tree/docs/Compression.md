# Compression

This document covers reducing per node costs in common high node count use-cases using the approach prototyped in <https://github.com/CraigMacomber/sequence/tree/main/src>.

## Motivation

We want users of shared tree to encode their data as nodes, all the way down to primitive leaf values, like characters and integers.
This means they can have a unified approach on all structured data, and not use a separate approach for blobs of data at leaves.
To make this practical modeling large qualities of data as nodes needs to have very low overhead compared to using a custom format and putting the data in a blob (a single node's `value`), at least for usage patterns that work reasonably well with a single large value.

Currently (with no compression), these cases suffer from inefficiency due to per node overhead for several reasons:

-   Each node is large when serialized. For example `{definition: "SomeUUID", identifier: "SomeOtherUUID", traits: {}, value: 5}` is much larger than just a byte storing the number 5. This is an issue for op bandwidth, summary upload and download bandwidth, and on disk document size (typically on the server) and also an issue due to processing costs (formatting, parsing and escaping long strings costs more than shorter ones).
-   Each node needs a separate entry in our structure to look up nodes by id. Currently this is an in memory b-tree. Having lots of nodes here costs memory, and reduces lookup performance (deeper trees, and less idea cache use). Additionally, this separated storage causes common tree access patterns, like child lookup or sequence traversal, to be relatively expensive compared to accessing children and sequences in a plausible custom a non-shared tree blob format.
-   Each node needs a separate entry in our structure to look up parents by id.
-   A lot of redundant data is stored in memory on each node. This is basically just another version for the serialized size being large.
-   Inserting and removing large numbers of nodes has high cost (compared to inserting one node with a blob value) due to accesses and changes all over the keyed by node identifier structures.

## Scoping a Solution

There are many different usage patterns for which different optimizations would be suitable.
Thus we can use the following approach:

-   Introduce an abstraction over some part of the tree where we can implement optimizations for particular usage patterns.
-   Provide a new optimized implementation of this abstraction which solves the above mentioned overheads for the known common large data cases.
-   Much longer term, consider adding more optimized implementations for other use cases as they are discovered.

The current use-cases we will focus on fall into two catagories:

-   Leaf Struct like data: documents where many leaf subtrees have exactly the same `shape` (same number of nodes, same traits, same definitions, same presence or absence of values, buf different value contents)
-   Sequences that contain mostly contiguous runs of identically structured leaf struct like data.

We will consider these cases where mutations which change this structure are possible, but most of the nodes don't get modified.
Ex: the a sequence might get a chunk of it moved somewhere else, ort delegated/inserted, but its uncommon for a large percentage of the nodes in it to have the set of traits used, or the number of children changed.

Additionally we will allow for identities of new nodes in these cases to be allocated in a way to benefit the compression.
The schema proposed here is sequential in pre-order traversal order.
Justifications for this exact choice are below.

Additionally we will focus on the in memory representation: as long as we are using an in memory format that is copy on write (aka a persisted datastructure) it has more constraints than the persisted format, since it need to provide fast random access and editing.
From the in memory representation, we can then derive a suitable persisted format that is efficient to encode, decode and store.

## Picking an Abstraction

There are many different places in the tree we could abstract to allow multiple data representations:

-   Node
-   Trait Map (the `traits` object on a Node)
-   Trait
-   Sequences (Content of of a trait)
-   Sequence Chunks (aka Sub-sections of Sequences)

For the use-cases above, we pick Sub-sections of Sequences Chunks.
This is because, like Node, they work well for individual struct like trees (chunk of length one),
but they also generalize well to sequences of mostly homogeneous data.
Sequence Chunks are a better choice than Sequences since they handle fully homogeneous sequences just about as well,
but regress much less when a large sequences is edited and is no longer fully homogeneous.

This abstraction can be implemented by changing the NodeIds in the b-tree (as well as in the child references in the nodes in the tree) into ChunkIds,
which identify a sequence chunk instead of a Node.

We then make the contents of the b-tree (and thus forest) into chunks, instead of Nodes.
Since we still need to be able to look up a node based on its identifier, we require that:

-   the Id of a chunk be equal to or less than the Id of any nodes it contains
-   the chunk only contain nodes with ids between that and some maximum value
-   all chunks have disjoint id ranges
-   a chunk can efficiently look-up information about a node within it, given the offset of that node into the chunk (`nodeId - chunkId`).
    A rust version of this can be seen as [Chunk](https://github.com/CraigMacomber/sequence/blob/ada56998a853ea19b5a6536e7b79771400044bc0/src/forest.rs#L16)

Together this means you can lookup a node by finding the entry in the b-tree with the id closest to it (it or lower),
then asking the chunk you get about it. ([An implementation](https://github.com/CraigMacomber/sequence/blob/ada56998a853ea19b5a6536e7b79771400044bc0/src/forest.rs#L72))

We then provide two implementations of a sequence chunk:

-   Our existing node implementation, which makes a chunk with a single node in it ([example of this in rust](https://github.com/CraigMacomber/sequence/blob/ada56998a853ea19b5a6536e7b79771400044bc0/src/basic_indirect.rs#L61))
-   A structurally compressed uniform sequence chunk ([example of this in rust](https://github.com/CraigMacomber/sequence/blob/ada56998a853ea19b5a6536e7b79771400044bc0/src/chunk.rs#L139))

## Structurally compressed sequence chunks

A structurally compressed sequence chunk, or just `UniformChunk` for short in this context, has 4 parts:

1. `data`: a flat array of values from the trees in the chunk, in pre-order traversal order.
2. `schema`: a description of the "shape" of a tree. (Ex: [RootChunkSchema](https://github.com/CraigMacomber/sequence/blob/ada56998a853ea19b5a6536e7b79771400044bc0/src/chunk.rs#L24))
3. `UniformChunk` itself which implements the Chunk abstraction, and is a value in the b-tree. ([UniformChunk](https://github.com/CraigMacomber/sequence/blob/ada56998a853ea19b5a6536e7b79771400044bc0/src/chunk.rs#L13)). This works by having a reference to the data, and the schema, and using the schema to index into the data when actual values are required.
4. `ChunkId`: the actual id. Since the b-tree stores the chunk under its ChunkId, its not necessary to store the id in the `UniformChunk`.

The `data` is logically owned by the `UniformChunk`, though it may optionally be stored out of line.
The `schema` is referenced by the `UniformChunk`, but most of its data should be deduplicated: many `UniformChunk`s will have identical schema.
The `schema` information can be factored into two parts:

1. Minimal description of the tree shape:
    - definition
    - does it have a value? (if using a byte array, how long is the value)
    - list of traits (each with a trait id, a child count, and a reference to a `schema` for the child)
2. Derived data used to accelerate lookups. This is omitted from the serialized version of UniformChunk, and is not detailed here. The short version is store what ever is needed to optimize the implementation of Chunk that UniformChunk provides. This is only needed on the root schema, and is why (Ex: [RootChunkSchema](https://github.com/CraigMacomber/sequence/blob/main/src/chunk.rs#L24)) is distinct from [ChunkSchema](https://github.com/CraigMacomber/sequence/blob/ada56998a853ea19b5a6536e7b79771400044bc0/src/chunk.rs#L106). Things like tables to look up schema or parent info from `idOffset % stride` (where stride is the number of nodes in the schema for a single tree in the two level sequence) belong there.

Another way to think about this is there are 3 classes of data for nodes in a uniform chunk:

1. values: stored in the data array as part of the uniform chunk.
2. shape/schema: includes definition, traits, parentage etc. Stored in the `schema` and deduplicated, and referenced from the chunk.
3. identifiers: inferred based off the chunk's id.

This format can only encode sequence chunks which have the following properties:

1. All id are in preorder traversal order.
2. All trees in the top level sequence have identical shape/schema. This includes:
    - definitions
    - number of children and their shape(recursively) in each trait.
    - presence or absence of a value (and size if using a encoding like a byte array where size impacts the access to other values).

### Serialized Format

Assuming javascript/json here, as well as a javascript array of values not some backed byte array.

For nodes we currently have `TreeNode` as defined by: (See actual source for for documentation)

```typescript
export interface TraitMap<TChild> {
	readonly [key: string]: TreeNodeSequence<TChild>;
}

export type TreeNodeSequence<TChild> = readonly TChild[];

export interface NodeData {
	readonly payload?: Payload;
	readonly definition: Definition;
	readonly identifier: NodeId;
}

export interface TreeNode<TChild> extends NodeData {
	readonly traits: TraitMap<TChild>;
}
```

In memory (in the b-tree), `TChild` is a `NodeId`, when persisted, its a recursive Node type:

```typescript
export type ChangeNode = TreeNode<ChangeNode>;
```

Adding support for UniformChunks means that `TChild` will become a `ChunkId` in memory/b-tree, and when persisted will become a slightly different recursive type:

```typescript
// ChunkSchemaId is used as index into interner/dedup table of ChunkSchema<ChunkSchemaId>
export type ChangeNode = TreeNode<ChangeNode | UniformChunk<ChunkSchemaId>>;

export interface UniformChunk<TSchema> {
	readonly data: Payload[];
	// Schema. Runtime version would have some extra cached info compared to persisted.
	readonly schema: TSchema;
	// Id of this chunk, and also NodeId of first node in this chunk. Only needed here in persisted case.
	readonly identifier: ChunkId;
}

export interface ChunkSchema<TChild> {
	readonly hasValue: boolean;
	readonly definition: Definition;
	// `traits` has to be a list not an object/map because order matters and objects might not preserve order though json.
	readonly traits: readonly { readonly label: string; readonly schema: TChild; readonly count: number }[];
}
```

### Finding when data should be chunked

Eventually the work of deciding when to chunk data can mostly be paid by the client inserting the data, and it can stay chunked through the whole system.
Thus would make the decision relatively easy and efficient since the client doing the insert mostly likely has schema for the data, and when appropriate translating it into shared-tree chunks instead of nodes should be straight forward.

That said, an algorithm to determine when to chunk data that does not need help from the client is practical.
We can use a recursive algorithm, which returns the shape of the subtree (indicating it should be part of a uniform chunk) or an actual encoded version of the ree (may or may not be compressed).

-   As the base case, all leaves can be chunked: return their trivial shape.
-   For sequences (in traits):
    -   if length 1: chunk it: return the shape indicating to make it part of a larger UniformChunk if possible
    -   if length > 1: as a heuristic, break it into a minimal number of UniformChunks, and do not chunk any thing above this in the tree.
-   For non-leaf nodes:
    -   If any child sequence/trait returns do not chunk, make a normal node.
    -   If its ids are not sequential in pre-order traversal order, make a normal node (though sections of its children might be chunks)
    -   Otherwise, return a shape, so this node can be part of a larger chunk.

This should be possible in `O(size of tree)` time and `O(size of tree)` space, and thus not change the asymptotic complexity of processing if used as part of serialization or change processing.

Note that the one place we sometimes decide to not chunk a tree where it might be possible to chunk it is parents of uniform sequences of length greater than 1.
This heuristic helps prevent very large numbers of schemas being generated in cases where the number of children are variable (eventually we plan to store and reuse the schema lone term with stable ids, so accumulating lots of them would be bad).
Depending on context a different heuristic might be desirable, but this one is simple and should work pretty well in practice.

## Future Options

Since the ChunkSchema are deduplicated, their size should not matter much, so it should be fine to use the somewhat verbose types above.
In the future we might introduce an alternative encoding of them thats more compressed if they end up being a large portion of documents:
note that this makes the data non-human readable and makes the serialized types less in line with the in memory ones, so it is a tradeoff.
We will likely want to keep support for the human readable format long term, at least for debug-ability.

There are lots of possible generalizations of UniformChunk format (ex: allow referring to subtrees by chunk id in the value array, or allowing variable sized traits).
These can be added as additional Chunk formats later, or as generalizations to UniformChunk.
