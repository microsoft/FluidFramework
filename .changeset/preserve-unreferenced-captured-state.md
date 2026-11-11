---
"@fluidframework/container-loader": minor
"__section": legacy
---
Preserve unreferenced data stores and attachments in captured container state

With the default `"inline"` blob capture mode, `captureFullContainerState` retains all structural snapshot contents, including unreferenced data stores and their DDSs.
This lets a resumed session process operations that reference these stores again without fetching historical structural blobs from storage.
Default inline capture also retains GC-unreferenced attachment payloads, since restoring a data store reference does not emit another `BlobAttach` operation.
Tombstoned and deleted attachment local IDs are excluded, but eligible aliases can retain the same payload.
Storage-ID identity aliases are kept for legacy handles, so exclusion is not a guarantee that those payloads are omitted.
Containers with loading groups in unreferenced subtrees are rejected instead of producing incomplete captured state.
If capture is rejected for loading groups, use a regular online container load instead; this capture API does not yet support those containers.
