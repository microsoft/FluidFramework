---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Array move events now behave consistently before and after hydration

Range moves on unhydrated arrays now produce change events and deltas consistent with hydrated arrays, including when the destination is within the source range and the contents remain unchanged.
This also makes insertion anchors update consistently before and after hydration.

Moving an empty range on unhydrated arrays no longer emits change events, matching hydrated arrays.
