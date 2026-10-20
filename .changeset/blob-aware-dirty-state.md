---
"@fluidframework/container-definitions": minor
"@fluidframework/container-runtime": minor
"@fluidframework/fluid-static": minor
"fluid-framework": minor
"__section": fix
---
Container dirty state now accounts for outstanding attachment blob work

`IContainer.isDirty` and `IFluidContainer.isDirty` now include outstanding attachment blob work, not just operations.
Previously, `saved` could fire during a blob upload, allowing hosts to dispose the container and lose the attachment.
Do not dispose a container while `isDirty` is `true`.

Blob work ends when sharing succeeds, fails, or is cancelled.
The `saved` event means no local work remains outstanding, not that every blob was shared successfully.
Failed or cancelled handles may remain unusable; observe the handle's `payloadShared` and `payloadShareFailed` events for individual outcomes.

```ts
container.on("saved", () => container.dispose());
```

Helpers waiting for `saved` now also wait for blob sharing to end.
A stalled upload can keep them waiting indefinitely.

Blob coverage requires `@fluidframework/container-loader` from this release or later.
Older loaders retain operation-only tracking; service clients such as `@fluidframework/azure-client` include a matching loader.
Setting the runtime configuration flag `Fluid.ContainerRuntime.DisableBlobAwareDirtyState` to `true` restores operation-only dirty tracking.
With either fallback, `saved` can fire while blob work remains outstanding.
