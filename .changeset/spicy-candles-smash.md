---
"@fluidframework/tree": minor
"fluid-framework": minor
---
---
"section": tree
---

Optimize non-leaf field field access

Reading of non-leaf children which have previously been read are recovered from cache faster.
Several operations on subtrees under arrays have been optimized, including reading of non-leaf nodes for the first time.
Overall this showed a roughly 10% speed up in a read heavy test application (the BubbleBench example) but gains are expected to vary a lot based on use-case.
