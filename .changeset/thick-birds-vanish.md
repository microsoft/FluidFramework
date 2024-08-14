---
"@fluidframework/tree": minor
---
---
section: tree
---

Fix document-corrupting bug when rebasing over move compositions.

Before this fix, if multiple users concurrently performed moves (possibly by reverting prior moves), there was a chance that the document would become corrupted.
