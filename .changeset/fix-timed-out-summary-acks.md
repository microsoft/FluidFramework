---
"@fluidframework/container-runtime": minor
"__section": fix
---
Preserve garbage collection references after a summary times out

A late acknowledgment for a timed-out summary no longer promotes state from a later, unaccepted summary attempt.
When the accepted snapshot is available, the next summarizer loads it before generating a new summary, so recent reference changes are preserved.
