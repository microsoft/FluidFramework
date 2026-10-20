---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Range move events and insertion anchors now behave consistently before and after hydration

Array insertion anchors on unhydrated nodes now match the behavior of anchors on hydrated nodes when a range is moved to its own starting gap or an interior gap.
These moves leave the array contents unchanged, but can update insertion anchor indexes.
Unhydrated arrays now also emit change events for moves to an interior gap, matching hydrated arrays.
Previously, these interior moves emitted no change events on unhydrated arrays.

Moving an empty range on unhydrated arrays now emits no change events, matching hydrated arrays.
This applies both within one array and between arrays.
Argument and source/destination compatibility validation still apply.
