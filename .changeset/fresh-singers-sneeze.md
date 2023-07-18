---
"@fluidframework/merge-tree": major
"@fluidframework/sequence": major
---

Remove ISegment.parent

This change removed the parent property on the ISegment interface. The property will still exist, but should not generally be used by outside consumers.

There are some circumstances where a consumer may wish to know if a segment is still in the underlying tree and were using the parent property to determine that.

Please change those checks to use the following `"parent" in segment && segment.parent !== undefined`
