---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
TreeNodes now implicitly generate identifiers on access instead of erroring

Accessing a defaulted [identifier](https://fluidframework.com/docs/api/fluid-framework/schemafactory-class#identifier-property) on an [Unhydrated](https://fluidframework.com/docs/api/fluid-framework/unhydrated-typealias) `TreeNode` no longer throws a usage error.
Instead a new UUID is allocated for the identifier and returned.
These UUIDs will be more compressible than random ones, since they all come from a single sequence (starting with a random UUID),
but they will not be fully compressed like the identifiers generated after hydration that leverage the document's [IIdCompressor](https://fluidframework.com/docs/api/id-compressor/iidcompressor-interface).
