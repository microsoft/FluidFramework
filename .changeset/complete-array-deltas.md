---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Array node deltas now cover the complete array

`ArrayNodeDeltaOp` and `ArrayNodeTreeChangedDeltaOp` sequences now include a final retain operation for an unchanged trailing portion of the array. Consumers can process the operations as a complete delta without separately retaining an omitted suffix.

Text deltas inherit the same complete-coverage behavior.

This should not break any existing users as this behavior was allowed under the old specification, but may allow some users to simplify their processing of the delta.
