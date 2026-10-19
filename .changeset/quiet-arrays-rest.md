---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Unhydrated array range moves preserve content when the destination overlaps the source

Calling [`TreeArrayNode.moveRangeToIndex`](https://fluidframework.com/docs/api/fluid-framework/treearraynode-interface#moverangetoindex-methodsignature) with a destination gap inside the source range now leaves an [`Unhydrated`](https://fluidframework.com/docs/api/fluid-framework/unhydrated-typealias) array unchanged, matching the resulting array contents in the hydrated case.
Previously, these moves could reorder the array incorrectly and emit change deltas that did not match its content.

The destination gap is a position between items before the move, not an index in the resulting array.
For example, calling `array.moveRangeToIndex(1, 0, 2)` on an array containing `["a", "b", "c", "d", "e", "f"]` now leaves that array unchanged.
These overlapping moves do not emit change events on unhydrated arrays.
Hydrated arrays may still emit change events even though their content remains unchanged.
