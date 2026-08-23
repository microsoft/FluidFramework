---
"@fluidframework/container-runtime": minor
"@fluidframework/container-loader": minor
"__section": feature
---

Add experimental option to skip separate blob uploads when attaching a detached container

A new experimental `ContainerRuntimeOptions` flag, `enableSingleRoundTripFileCreate`, lets a
detached container with `uploadBlob()`-created blobs attach in a single logical service request
instead of `N + 2`. When enabled, blobs created while detached are embedded as flat entries in one
shared attach-summary subtree with one shared `groupId`, instead of being uploaded to detached
storage ahead of time. Arbitrary bytes are persisted as binary `SummaryType.Blob` content and
remain permanently summary-backed: attached clients read the original bytes lazily, while ordinary
clean summaries reuse stable path handles. Drivers may base64-encode binary summary blobs on their
wire format when accompanied by encoding metadata, but storage returns the original bytes from
`readBlob`. Loader JSON artifacts retain lossless UTF-8 snapshot blobs in the legacy
`snapshotBlobs` map and use a generic base64 `snapshotBlobContents` map only for arbitrary bytes
that cannot be represented there. Full-tree summaries and full-state capture explicitly materialize
the content. The loader's core attach state machine remains unchanged. The option is currently
beta and requires explicit document-schema control with a collaboration floor of `3.0.0`. The
runtime also requires a loader that advertises binary structural-snapshot serialization support
whenever the persisted feature is active, so mixed clients with an older loader fail layer
compatibility regardless of the specific blob bytes. Outside that persisted feature, the generic
serialized-state format remains backward compatible for states containing only lossless UTF-8
snapshot blobs; pending or detached state containing arbitrary binary structural blobs requires a
loader that understands `snapshotBlobContents`. See
`packages/runtime/container-runtime/src/blobManager/singleRoundTripFileCreate.md` for the persisted
format, scenario-specific behavior, and current limitations.

```typescript
await loadContainerRuntime({
	// Existing load parameters...
	runtimeOptions: {
		explicitSchemaControl: true,
		enableSingleRoundTripFileCreate: true,
	},
	oldestSupportedClient: "3.0.0",
});
```
