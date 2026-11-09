---
"@fluidframework/container-loader": minor
"__section": feature
---
Capture structural container state without attachment payloads

`captureFullContainerState` accepts `includeAttachmentBlobs: false` to omit attachment bytes while retaining structural snapshot contents, attachment references, and saved operations.
The option applies to attachments in the base snapshot and attachments introduced by later operations.
The default remains `true`.

```typescript
const pendingLocalState = await captureFullContainerState({
	urlResolver,
	documentServiceFactory,
	request,
	includeAttachmentBlobs: false,
});
```

Resuming structural state does not require historical structural blobs from storage.
Reading an omitted attachment requires live storage and depends on that attachment remaining available.
This option does not change retention or garbage collection.
`blobCaptureMode: "reference"` continues to omit both structural and attachment payloads regardless of this option.
