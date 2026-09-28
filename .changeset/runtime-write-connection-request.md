---
"@fluidframework/container-definitions": minor
"@fluidframework/container-loader": minor
"__section": feature
---
Request a write connection without submitting an operation

`IContainerContext` now provides an optional `requestWriteConnection(): void` capability.
Runtimes can request a one-shot write connection, for example to participate in summarizer election before any application edits.
The loader upgrades an existing read connection asynchronously, or applies the request to the next permitted connection.
The request does not submit an operation, change the default reconnection mode, resume a paused load, or override read-only permissions and host connection policies.
Older loaders may omit the capability.
