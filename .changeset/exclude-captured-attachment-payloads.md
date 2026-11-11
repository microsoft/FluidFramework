---
"@fluidframework/container-loader": minor
"__section": legacy
---
Capture structural container state without attachment payloads

`captureFullContainerState` accepts `blobCaptureMode: "structural"` to omit attachment bytes while retaining structural snapshot contents, attachment references, and saved operations.
The option applies to attachments in the base snapshot and attachments introduced by later operations.
The default remains `"inline"`, which captures structural and eligible attachment payloads.

```typescript
const pendingLocalState = await captureFullContainerState({
	urlResolver,
	documentServiceFactory,
	request,
	blobCaptureMode: "structural",
});
```

Resuming structural state does not require historical structural blobs from storage.
Offline structural loading can succeed, but dereferencing an omitted attachment later fails.
The storage layer throws `UsageError`, which handle resolution may wrap.
Structural captures carry an internal omission-policy marker so offline attachment failures identify `blobCaptureMode: "structural"`.
Unmarked legacy state retains generic missing-payload guidance; neither marker presence nor absence guarantees payload completeness.
Reading an omitted attachment requires the online form of `loadFrozenContainerFromPendingState` with live driver wiring (or `loadExistingContainer`) and depends on that attachment remaining available.
This option does not change retention or garbage collection.
`blobCaptureMode: "reference"` continues to omit both structural and attachment payloads.
