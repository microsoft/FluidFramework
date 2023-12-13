---
"@fluidframework/merge-tree": major
"@fluidframework/sequence": major
---

sequence: Removed Marker.hasSimpleType and made sequence operations return void

`Marker.hasSimpleType` was unused. Sequence operations now no longer return IMergeTree\*Msg types.
These types are redundant with the input.
