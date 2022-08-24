# Editable Tree

Editable Tree is a simple API for accessing a Forest's data.

An entry point is a `getEditableTree` function which returns a JS Proxy typed as `IEditableTree` allowing to read and write nodes of the Fores in a "JavaScript-object"-like manner, thus hiding all the Forest complexity.

This is intended to showcase basic read and write opeartions from and to the Forest based on a reference `ObjectForest` and a corresponding `Cursor` implementation.

Write operations require a schema-based data format convertion to be adopted/implemented, which will follow.
