---
"@fluidframework/tree": minor
---

Fix bug where reading tree during events could cause issues

Reading the tree inside of NodeChange and TreeChange events could corrupt internal memory structures leading to invalid data in subsequence reads as well as internal errors being thrown. This bug has been fixed.
