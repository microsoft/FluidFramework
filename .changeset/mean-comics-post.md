---
"@fluidframework/merge-tree": major
---

merge-tree now has new length calculations by default

The merge-tree now enables new length calculations by default and resolves some related performance bugs by making cached segment length
nullable. 

Hierarchy cached segment length is `undefined` if the length of all child nodes is `undefined`.
