---
"@fluidframework/merge-tree": minor
---

The expected type of the argument to the fromJSONObject function has changed.

Previously, the arguments of Marker.fromJSONObject and TextSegment.fromJSONObject were of type `any`. Now, the argument for the Marker implementation is of type `IJSONSegment` and the argument for the TextSegment implementation is of type `string | IJSONSegment`.
