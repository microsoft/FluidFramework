---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Range-based row/column removal methods have been added to TableSchema APIs (alpha)

Adds range-based overloads to `removeColumns` and `removeRows` for removing contiguous ranges of rows and columns.

The `removeAllColumns` and `removeAllRows` methods have also been removed, as they can be trivially implemented in terms of the new methods.
