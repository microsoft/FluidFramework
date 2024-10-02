# Chunked Forest

Implementation of Forest using chunks.
Optimized for small memory footprint and fast loading of chunked node data.

In this context, chunks are contiguous parts of the tree which get stored together in some data format.
Multiple chunk formats will be used to optimize for different cases.
Chunks are copy-on-write, but optimized to be mutated in place when a chunk only has a single user (detected using reference counting).
This allows for efficient cloning of forests, without major performance overheads for non-cloning scenarios.

## Status

Working, but not fully optimized.
Might not provide a faster experience than the reference implementation.

Currently unconditionally splits chunks when editing.
To actually deliver on the performance goals of this design,
it will need to keep data in uniform chunks in more cases:
this mainly requires avoiding splitting them into basic chunks when editing (ex: updating a leaf number) by supporting in-place updates via replace operations (which `DeltaVisitor` currently does not expose) instead of delete and inserts which forces the data to be re-encoded as the intermediate form violates the shape requires of the uniform chunk.

SequenceChunks also aren't well optimized in the cursor, since each one traversed adds another level of wrappers on the cursor.