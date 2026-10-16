---
"@fluidframework/container-definitions": minor
"@fluidframework/container-runtime": minor
"@fluidframework/fluid-static": minor
"fluid-framework": minor
"__section": fix
---
Container dirty state now accounts for outstanding attachment blob work

A container previously reported itself saved once its ops were acknowledged, even if an attachment blob
created locally had not yet been shared with the service and the other clients in the session.
Blob payloads are uploaded separately from ops, so a container could have no pending ops and still have
blob work outstanding.
Hosts that dispose a container in response to `saved` could therefore discard a blob payload that was
still in flight, losing the attachment.

`IContainer.isDirty` and `IFluidContainer.isDirty` now stay `true`, and the `saved` event is deferred,
until sharing has ended for every locally created attachment blob,
whether it completed, failed, or was cancelled.
The `dirty` and `saved` events fire on the same transitions as before, just with this broader definition
of outstanding work.

This means `saved` signals that no outstanding work remains, not that every blob was shared successfully.
A blob whose sharing fails or is cancelled can leave its handle unusable even though `saved` fires.
To learn the outcome of an individual blob,
observe its handle's `payloadShared` and `payloadShareFailed` events.

For hosts, the guidance is unchanged but now holds for blobs as well: do not dispose a container while
`isDirty` is `true`, because doing so discards the outstanding work.

```ts
container.on("saved", () => {
    // Previously this could run while a blob payload was still uploading.
    // It now runs only once outstanding op *and* blob work has ended.
    container.dispose();
});
```

This also means helpers that wait for a container to be saved now wait for blob sharing to end.
Code that deliberately stalls a blob upload and then waits for `saved` will wait until that upload
completes, fails, or is cancelled.

Hosts that compose their own loader and runtime should note that blob coverage also requires
`@fluidframework/container-loader` from this release or later.
Against an older loader the runtime keeps the previous operation-only behavior, so `isDirty` can report
`false` while a blob is still being shared.
Service clients such as `@fluidframework/azure-client` ship a matching loader, so they are unaffected.
