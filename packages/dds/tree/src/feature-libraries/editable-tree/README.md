# editable-tree

Editable Tree is a simple API for accessing a Forest's data.

The entry point is `getEditableTree` which returns an `EditableTree` which allows reading and writing nodes of the Forest in a "JavaScript-object"-like manner.

## Status

Currently implementation uses a JavaScript proxy and is focused on reading the tree: support for editing is not yet implemented.

Write operations will require a schema-based data format conversion to be implemented.

