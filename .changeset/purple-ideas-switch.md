---
"@fluidframework/tree": minor
---
---
"section": deprecation
---

The function `processCore` on `SharedTreeCore` is now deprecated.

A new function `processMessagesCore` has been added in its place which will be called to process multiple messages instead of a single one on the channel. This is part of a feature called "Op bunching" where contiguous ops in a grouped batch are bunched and processed together by the shared object.

Implementations of `SharedTreeCore` must now also implement `processMessagesCore`. For a reference implementation, see `SharedTreeCore::processMessagesCore`.
