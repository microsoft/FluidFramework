# Chunked Forest

Implementation of Forest using chunks.
Optimized for small memory footprint and fast loading of chunked node data.

Uses multiple chunk formats to optimize for different cases.
Chunks are ref counted to allow for copy on write, but optimized to mutate in place when a chunk only has a single user.
This allows for efficient closing of forests, without major performance overheads for non cloning sceneries.

## Status

In progress: not ready for use.
