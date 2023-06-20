---
"@fluidframework/merge-tree": minor
"@fluidframework/sequence": minor
---

Deprecate ISegment.parent

This change deprecates the parent property on the ISegment interface. The property will still exist, but should not generally be used by outside consumers.

There are some circumstances where a consumer may wish to know if a segment is still in the underling tree, and were using the parent property.

Please change those checks to use the following `"parent" in segment && segment.parent !== undefined`
