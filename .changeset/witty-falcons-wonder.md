---
"@fluidframework/shared-object-base": minor
---
---
"section": deprecation
---

Deprecate `processCore` on `SharedObject` and `SharedObjectCore` in favor of `processMessagesCore`

A new function `processMessagesCore` has been added in place of `processCore`, which will be called to process multiple messages instead of a single one on the channel. This is part of a feature called "Op bunching" where contiguous ops in a grouped batch are bunched and processed together by the shared object.

Implementations of `SharedObject` and `SharedObjectCore` must now also implement `processMessagesCore`. A basic implementation could be to iterate over the messages' content and process them one by one as it happens now. Note that some DDS may be able to optimize processing by processing the messages together.
