---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Reduce the memory used by large schemas, especially when creating content under many node types

Without staged schema upgrades, the stored schema derived from each node schema is shared by every root it is reachable from, such as the node types content is created or imported under.
The unhydrated context of a node type whose schema was already validated as part of a larger schema looks schema up in that larger schema's definitions instead of building its own.
Schema components and field schema also keep less data.
This reduces the memory and time needed to create content under many node types of a large schema.
