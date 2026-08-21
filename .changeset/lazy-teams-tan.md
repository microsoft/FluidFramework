---
"@fluidframework/container-runtime": minor
"__section": feature
---

Add server timestamps to beta version mark resolution APIs

The `@beta` `IVersionMarkResolver` APIs now expose the server timestamp of a resolved mark while remaining compatible with callers using the previous result and listener shapes:

- The resolved variants returned by `sealAndCaptureVersionMark()` and `resolve()` populate an optional `timestamp` property.
- The `onBatchSequenced()` listener can receive `timestamp` as its optional third argument when an incoming batch resolves a pending mark.
