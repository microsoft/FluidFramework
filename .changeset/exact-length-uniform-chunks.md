---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Smaller uniform chunks in the optimized forest

The optimized forest stores runs of nodes with the same fixed shape as uniform chunks: one array of values per chunk, and a table describing every node of the shape.
The value arrays are now stored at exactly their length, without the spare capacity arrays built by `push` keep, and each shape's table of node positions is created only when a chunk with that shape is first read, so shapes only used inside other shapes no longer have one.

In a benchmark of a document with 200 sections, the heap retained by the tree after inserting the content fell from about 16.9 MB to about 14.6 MB, and after loading the same content from its compressed form from about 17.6 MB to about 17.1 MB.
