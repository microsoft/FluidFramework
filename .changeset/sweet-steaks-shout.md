---
"@fluidframework/merge-tree": minor
---

Deprecation of findTile in favor of searchForMarker, which uses depthFirstNodeWalk to locate the nearest marker.

findTile has a decent amount of buggy behavior, which leads partners who want to use it to implement workarounds for the odd behavior. searchForMarker is being introduced as a replacement. It performs the same basic functionality of searching for the nearest marker to a given start position in the indicated direction. However, it includes the start position as one of the nodes to search, so markers at the start position will be returned as the nearest marker to that position. Notably, positions 0 and length-1 will be included in the search as well, so searching forwards from position 0 or backwards from position length-1 would allow the entire string to be searched.
