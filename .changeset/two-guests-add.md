---
"@fluidframework/merge-tree": minor
---
---
"section": "deprecation"
---
Deprecate segmentGroups and ack on ISegment

The `SegmentGroupCollection` class, along with the `segmentGroups` property and `ack` function on segments, are not intended for external use.
These elements will be removed in a future release for the following reasons:

 * There are no scenarios where they need to be used directly.
 * Using them directly will cause eventual consistency problems.
 * Upcoming features will require modifications to these mechanisms.
