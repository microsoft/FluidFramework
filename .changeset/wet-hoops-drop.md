---
"fluid-framework": minor
"@fluidframework/tree": minor
---

nodeChanged event now includes the list of properties that changed

The payload of the `nodeChanged` event emitted by SharedTree now includes a `changedProperties` property that indicates
which properties of the node changed.

For object nodes, the list of properties uses the property identifiers defined in the schema, and not the persisted
identifiers (or "stored keys") that can be provided through `FieldProps` when defining a schema.
See the documentation for `FieldProps` for more details about the distinction between "view keys" and "stored keys".

For map nodes, every key that was added, removed, or updated by a change to the tree is included in the list of properties.

For array nodes, the set of properties will always be undefined: there is currently not an API to get details about changes to an array.
