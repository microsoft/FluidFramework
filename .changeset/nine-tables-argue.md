---
"@fluid-experimental/tree2": major
---

Regressions and new node removal model

Regression 1: All changes are atomized by the `visitDelta` function. This means that, if you insert/remove/move 2 contiguous nodes, the `visitDelta` function will call the `DeltaVisitor` twice (once for each node) instead of once for both nodes. Anything that sits downstream from the `DeltaVisitor` will therefore also see those changes as atomized.

Regression 2: The forest never forgets removed content so the memory will grow unbounded.

Removed nodes are preserved as detached in the forest instead of deleted. Anchors to removed nodes remain valid.

Change notification for node replacement in optional and required fields are now atomic.

Updated `PathVisitor` API.

Forest and AnchorSet are now updated in lockstep.
