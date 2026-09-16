---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": fix
---
createIdentifierIndex handles schemas with multiple identifiers consistently

[`createIdentifierIndex`](https://fluidframework.com/docs/api/tree/#createidentifierindex-function) now indexes a node only when its schema has exactly one [`identifier`](https://fluidframework.com/docs/api/tree/schemafactory-class#identifier-property) field.
Schemas with multiple identifier fields are skipped instead of arbitrarily indexing the first identifier field.
This avoids field-order-dependent behavior while allowing identifier indexes to be created for trees containing such schemas.

Identifier indexes now also take advantage of identifier fields being immutable.
This avoids unnecessarily re-indexing existing nodes after tree edits while continuing to index newly created nodes and filter detached nodes from index results.
