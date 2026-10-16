---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Insertion anchors now track range moves consistently before and after hydration

Array insertion anchors on unhydrated nodes now match the behavior of anchors on hydrated nodes when a range is moved to its own starting gap or an interior gap.
These moves leave the array contents unchanged, but can update insertion anchor indexes.
