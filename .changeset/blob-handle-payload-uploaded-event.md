---
"@fluidframework/core-interfaces": minor
"@fluidframework/container-runtime": minor
"@fluidframework/runtime-utils": minor
"__section": feature
---

Local blob handles now emit a `payloadUploaded` event when their payload finishes uploading

Local Fluid handles created with pending payloads (for example, blob handles created via `uploadBlob` when `createBlobPayloadPending` is enabled) now emit a new `payloadUploaded` event once the payload has been uploaded to storage, but before it is shared to remote collaborators.

This is a local-only milestone that precedes the existing `payloadShared` event. Sharing a payload involves two steps: uploading it to storage, and then sending an op that makes it available to remote collaborators (which requires a connection). The `payloadUploaded` event lets a local client observe when the upload has completed without waiting for the payload to be shared — for instance, to wait for all pending blob uploads to finish before connecting the container.

```typescript
handle.events.on("payloadUploaded", () => {
	// The blob has been uploaded to storage and its BlobAttach op enqueued, but that op has not yet been sequenced/acked.
});
```

Note that `payloadUploaded` is not guaranteed to fire before `payloadShared`. A handle may transition directly to shared (skipping an observable upload) — for example, when loading from pending state and observing the `BlobAttach` op from the client that generated that state.

To make consuming this event easier, `@fluidframework/runtime-utils` now exposes three helpers:

- `waitForPayloadUploaded(handle, abortSignal?)` returns a promise that resolves once a locally-created pending-payload handle has uploaded its payload (resolving immediately if it is already uploaded/shared), and rejects if sharing fails or the optional `abortSignal` aborts.

- `withDisposalAbort(source, operation)` runs an async operation with an `AbortSignal` that aborts when the given source (for example, an `IContainer`) is disposed, and removes the disposal listener once the operation settles (on both success and failure) so it never leaks. Compose it with `waitForPayloadUploaded` so the wait can never hang past container disposal:

```typescript
await withDisposalAbort(container, (signal) => waitForPayloadUploaded(handle, signal));
```

- `waitForEvent(listenable, resolveOn, options?)` is a general-purpose helper that resolves the next time one of the given events fires on any `Listenable`, with optional `abortSignal` cancellation and `rejectOn` failure events. It cleans up all subscriptions before settling.

