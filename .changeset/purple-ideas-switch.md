---
"@fluidframework/tree": minor
---
---
"section": deprecation
---

Deprecate `processCore` on `SharedTreeCore` in favor of `processMessagesCore`

A new function `processMessagesCore` has been added in place of `processCore`, which will be called to process multiple messages instead of a single one on the channel. This is part of a feature called "Op bunching" where contiguous ops in a grouped batch are bunched and processed together by the shared object.

Implementations of `SharedTreeCore` must now also implement `processMessagesCore`. For a reference implementation, see `SharedTreeCore::processMessagesCore`.
