# Chunked Forest

Implementation of Forest using chunks.
Optimized for small memory footprint and fast loading of chunked node data.

In this context, chunks are contiguous parts of the tree which get stored together in some data format.
Multiple chunk formats will be used to optimize for different cases.
Chunks are copy-on-write, but optimized to be mutated in place when a chunk only has a single user (detected using reference counting).
This allows for efficient cloning of forests, without major performance overheads for non-cloning scenarios.

## Status

In progress: not ready for use.
