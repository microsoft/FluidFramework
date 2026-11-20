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
For example, in a benchmark which imports content under 40 node types of a schema with 300 object types and 1,400 enum values, the memory the schema retains for those imports drops from 39.2 MB to 4.3 MB, and the imports take about 0.43 seconds instead of about 1.0 second.
