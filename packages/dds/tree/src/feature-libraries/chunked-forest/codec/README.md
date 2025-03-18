# Chunked Forest Codec

Provides a serializable encoding of trees which is optimized for size as well as fast encoding and decoding.

## Encoding Optimizations

Two main algorithms are used:

-   Shape based encoding: Trees are split into "Shape" information and "Data".
    "Shape" can (but does not have to) contain information like type, which fields exist, and how many nodes are in them and the shapes of those nodes.
-   [Dictionary Coding](https://go-compression.github.io/algorithms/dictionary/) using `Counter` from [chunkCodecUtilities.ts](./chunkCodecUtilities.ts)
    is applied to Identifiers (such as type names and field keys) and Shapes.

The main challenge is deciding what shapes to use: if too much information is captured in the shape, there will be more shapes which take up more space,
but if too little information is captured in the shapes, the size of the encoded tree will be large.

Balancing this involves making strategic choices about what to include in the shape, and what not to.
A few implementations are included which make different choices here:

-   [uncompressedEncode.ts](uncompressedEncode.ts): the simplest implementation, which captures nothing in the shape and does no Dictionary Coding of identifiers.
    This makes for more human readable data as well as a simple reference implementation.
-   [compressedEncode.ts](compressedEncode.ts): some utilities for actual compressed encoding, but does not contain any advanced strategies (instead they must be provided to it via the `EncoderCache`)
-   [schemaBasedEncode.ts](schemaBasedEncode.ts): a strategy for compressedEncode using schema to infer commonly used shapes.

### Future Optimizations

One nice thing about this encoding scheme is there is room to improve compression without changing the format (and thus without changing the decoder).
There are two main kinds of optimizations of this type:

-   Improve selection of shapes to be based on more than just schema.
    For example generate multiple shapes for the same schema, or generate a shape even more specific than the schema if the permitted degrees of freedom are not used.
-   Improve encoding performance by leveraging existing chunking of the input data.
    For example uniform chunks could be encoded as nested arrays using their existing data array.

There is also the possibility to performance optimize decode to generate pre-chunked data, using the shapes to infer when uniform should be created,
and using nested arrays for uniform chunk data without copying them.

Potential optimizations involving breaking format changes:

-   avoid having to put shapes in all the encoded trees, and instead refer to shapes stored elsewhere.
    This could leverage schema to imply shapes, use shapes referenced earlier in the session (similar to how session identifier allocation is planned to work), or use some other mechanism, such as a shape cache stored in the document or references to blobs containing previously used shapes (possibly from summaries).
-   binary format
-   adding more sophisticated shapes: (would also require improvements to shape selection strategy to use these)
    -   adding delta encoding so shapes can generate sequential values such as node identifier UUIDs implicitly.
    -   allow use of id compressor to specify UUIDs using shorter formats. Like external shape references, this would make the format not self contained and thus require session state to encode and decode.

## Code Layering

The files in this project are layered (ordered such that dependencies are only take in one direction) as follows:

-   "generic" vs non-generic: "generic" refers to code which does not depend on specific kinds of shapes:
    format changes which add or remove kinds of encoded shapes should not impact these files.
-   "format" vs other: "format" files define the actual persisted data format.
    Note that choices like how the "data" array contents are structured are considered to be defined in the format files as part of the shapes there, despite them not being captured by the schema in those files:
    these details should be fully defined by documentation in the format files which must not depend on other files.
