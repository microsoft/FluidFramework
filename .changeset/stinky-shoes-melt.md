---
"fluid-framework": minor
---
---
"section": "tree"
---

New alpha APIs for indexing

SharedTree now supports indexing via two new APIs, `createSimpleTreeIndex` and `createIdentifierIndex`.

`createSimpleTreeIndex` is used to create a `SimpleTreeIndex` which indexes nodes based on their schema.
Depending on the schema, the user specifies which field to key the node on.


`createIdentifierIndex` is used to create an `IdentifierIndex` which provides an efficient way to retrieve nodes using the node identifier.
