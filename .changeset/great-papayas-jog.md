---
"@fluidframework/merge-tree": minor
---
---
kind: fix
---

merge-tree: The Marker.fromJSONObject and TextSegment.fromJSONObject argument types have been corrected

Previously, the arguments of `Marker.fromJSONObject` and `TextSegment.fromJSONObject` were of type `any`. However, at
runtime only certain types were expected and using other types would cause errors.

Now, the argument for the Marker implementation is of type `IJSONSegment` and the argument for the TextSegment
implementation is of type `string | IJSONSegment`. This reflects actual runtime support.

This change should have no impact on existing code unless the code is using incorrect types. Such code already does not
function and should be corrected.
