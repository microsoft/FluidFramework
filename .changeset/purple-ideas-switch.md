---
"@fluidframework/tree": minor
"fluid-framework": minor
---
---
"section": tree
---

Performance enhancements in Shared Tree

Op bunching - A new feature called "Op bunching" is added to Shared Tree where contiguous ops in a grouped batch are
bunched and processed together. This improves the performance of processing ops asymptotically - with the increase in
the number of local ops and incoming ops, the processing time will reduce. For example, with 10 local ops + 10 incoming
ops, the performance increases by 70%; with 100 local ops + 100 incoming ops, the performance increases by 94%.
This will help improve performance in the following scenarios:
- A client makes a large number of changes in a single JS turn. For example, copy pasting large data like a table.
- A client has a large number of local changes. For example, slow clients whose changes are slow to ack or clients with
a local branch with large number of changes.
