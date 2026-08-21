---
"@fluidframework/container-runtime": minor
"__section": legacy
---

Add server timestamps to beta version mark resolution APIs

The `@beta` `IVersionMarkResolver` APIs now expose the server timestamp of a resolved mark:

- The resolved variants returned by `sealAndCaptureVersionMark()` and `resolve()` include `timestamp`.
- The `onBatchSequenced()` listener receives `timestamp` as its third argument when an incoming batch resolves a pending mark.
