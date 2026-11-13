---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Reduce the cost of processing acknowledgements of local edits

When one of its own ops is sequenced, SharedTree now reuses the edit it encoded into that op instead of decoding the op again.
This reduces the work needed to process the acknowledgement of each local edit, especially for large edits.