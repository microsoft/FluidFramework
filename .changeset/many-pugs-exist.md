---
"@fluidframework/merge-tree": minor
"@fluidframework/sequence": minor
---

sequence: Remove the findTile API

The `findTile` API that was previously deprecated is now being removed. The new `searchForMarker` function provides similar functionality, and can be called with the start position, the client ID, the desired marker label to find, and the search direction, where a value of `true` indicates a forward search.
