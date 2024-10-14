---
"@fluidframework/tree": minor
"fluid-framework": minor
---
---
"section": tree
---

Non-leaf field access has been optimized

When reading non-leaf children which have been read previously, they are retrieved from cache faster.
Several operations on subtrees under arrays have been optimized, including reading of non-leaf nodes for the first time.
Overall this showed a roughly 5% speed up in a read heavy test application (the BubbleBench example) but gains are expected to vary a lot based on use-case.
