---
"@fluidframework/container-loader": patch
"__section": legacy
---
Preserve structural snapshot contents in reference-mode capture

`captureFullContainerState` with `blobCaptureMode: "reference"` now retains structural snapshot contents, attachment references, and saved operations while omitting attachment bytes.
Previously, reference mode omitted structural payloads as well, making continuation depend on historical summary blobs remaining available in storage.
The option applies to attachments in the base snapshot and attachments introduced by later operations.
The default remains `"inline"`, which captures structural and eligible attachment payloads.

```typescript
const pendingLocalState = await captureFullContainerState({
	urlResolver,
	documentServiceFactory,
	request,
	blobCaptureMode: "reference",
});
```

Reference capture uses the same snapshot-subtree filtering as inline capture; this fix does not change structural completeness.
Captured structural payloads are available without live storage, but this does not guarantee that every payload needed for continuation was captured.
Reference-mode state can load offline, but dereferencing an omitted attachment later fails.
The storage layer throws `UsageError`, which handle resolution may wrap.
Offline reads of omitted attachments from newly captured reference-mode state identify `blobCaptureMode: "reference"` in the error message.
Reading an omitted attachment requires the online form of `loadFrozenContainerFromPendingState` with live driver wiring (or `loadExistingContainer`) and depends on that attachment remaining available.
This option does not change retention or garbage collection.
Both capture modes now require the resolved URL shape accepted by the offline loader.
Legacy reference-only captures remain loadable with live driver wiring; they do not gain missing structural payloads.
Reference captures can be larger and perform more structural reads than before. No new capture mode is introduced.
