---
"@fluidframework/sequence": minor
---

Deprecation of SharedString.findTile

findTile was previously deprecated on client and mergeTree, but was not on sharedString. Usage is mostly the same, with the exception that the parameter 'startPos' must be a number and cannot be undefined. 
