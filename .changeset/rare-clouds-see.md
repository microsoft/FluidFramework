---
"@fluidframework/sequence": minor
---

sequence: SharedString.findTile is now deprecated

findTile was previously deprecated on client and mergeTree, but was not on SharedString. Usage is mostly the same, with the exception that the parameter 'startPos' must be a number and cannot be undefined.
