---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Reduce the cost of reading nodes of a schema type for the first time

A node created by reading it from a tree no longer creates a default context for its schema, which only nodes created outside a tree use.
The first use of a node schema whose containing schema was already validated no longer validates it again.
This reduces the cost of reading nodes of many schema types for the first time, for example when loading a document.