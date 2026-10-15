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
until every locally created attachment blob has been uploaded and shared.
The `dirty` and `saved` events fire on the same transitions as before, just with this broader definition
of outstanding work.

For hosts, the guidance is unchanged but now holds for blobs as well: do not dispose a container while
`isDirty` is `true`, because doing so discards the outstanding work.

```ts
container.on("saved", () => {
    // Previously this could run while a blob payload was still uploading.
    // It now runs only once ops *and* blob payloads have been saved.
    container.dispose();
});
```

This also means helpers that wait for a container to be saved now wait for blob uploads to complete.
Code that deliberately stalls a blob upload and then waits for `saved` will wait until that upload
finishes.
