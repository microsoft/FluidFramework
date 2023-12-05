---
"@fluidframework/matrix": major
"@fluidframework/merge-tree": major
"@fluidframework/sequence": major
---

Enable noImplicitAny in merge-tree, sequence, and matrix. This changes the return types of some functions from any to void. This does not represent a logic change and only serves to make the typing of these functions more accurate.
