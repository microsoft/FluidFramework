# Chunked Forest

Implementation of Forest using immutable leaf chunks and copy on write ref counted mutable (when ref count is 1) internal chunks.

Optimized for small memory footprint and fast loading of chunked node data.
