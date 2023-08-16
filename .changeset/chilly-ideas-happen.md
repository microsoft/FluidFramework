---
"@fluidframework/merge-tree": minor
"@fluidframework/sequence": minor
---

Deprecate getStackContext and associated NestBegin/End

Deprecate SharedSegmentSequence.getStackContext and Client.getStackContext (and the enums ReferenceType.NestBegin and NestEnd they use).
This functionality is unused, poorly tested, and incurs performance overhead.
