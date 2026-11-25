---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Reduce the time needed to create a TreeViewConfiguration for large schemas

Without `preventAmbiguity`, `TreeViewConfiguration` only checks each union for duplicate schema, without reading the properties of each schema in it.
Walking the schema no longer creates a generator for each node schema, and reads the properties of each schema class less often.
This reduces the time needed to create a `TreeViewConfiguration` for schemas with many node types, such as schemas with many enum values.
