---
"@fluidframework/tree": patch
"__section": fix
---
Prevent duplicate nodes when reusing SharedTree sequences

Reusing a short sequence of tree nodes no longer duplicates its contents when the sequence is inlined.
