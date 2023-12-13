---
"@fluidframework/merge-tree": major
"@fluidframework/sequence": major
---

sequence: Removed several APIs

The following APIs have been removed:

- `Client.getStackContext`
- `SharedSegmentSequence.getStackContext`
- `IntervalType.Nest`
- `ReferenceType.NestBegin`
- `ReferenceType.NestEnd`
- `internedSpaces`
- `RangeStackMap`
- `refGetRangeLabels`
- `refHasRangeLabel`
- `refHasRangeLabels`

This functionality is deprecated, has low test coverage, and is largely unused.
