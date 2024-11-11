---
"fluid-framework": minor
---
---
"section": "tree"
---
Export alpha index APIs

This exposes two new index APIs, `createSimpleTreeIndex` and `createIdentifierIndex`.

`createSimpleTreeIndex` can be used to create a `SimpleTreeIndex` that indexes nodes based on their schema.
Depending on the schema, the user specifies which field to key the node on.


`createIdentifierIndex` is used to create an `IdentifierIndex` which provides an efficient way for users to retrieve nodes using the node identifier.
