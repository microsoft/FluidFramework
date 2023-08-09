---
"@fluidframework/merge-tree": minor
---

Deprecation of findTile in favor of searchForTile, which uses depthFirstNodeWalk to locate the nearest tiles.

findTile has a decent amoutn of buggy behvaior, which leads partners who want to use it to implement workarounds for the odd behavior. Since the search and backwardSearch methods were some of the last few that had not been refactored to use depthFirstNodeWalk instead of the recursive (backward)searchBlock methods, it was determined that the best path forward was to create a new implementation for searching a string for the nearest tiles.
