---
"@fluidframework/container-loader": minor
"__section": legacy
---
Preserve unreferenced data stores and attachments in captured container state

With the default `"inline"` blob capture mode, `captureFullContainerState` retains all structural snapshot contents, including unreferenced data stores and their DDSs.
This lets a resumed session process operations that reference these stores again without fetching historical structural blobs from storage.
Default inline capture also retains GC-unreferenced attachment payloads, since restoring a data store reference does not emit another `BlobAttach` operation.
Attachment blobs that garbage collection has tombstoned or deleted are generally omitted, but their contents may still be included when the same blob remains reachable another way, so do not rely on capture to remove them.

In both `"inline"` and `"reference"` modes, `captureFullContainerState` now rejects containers that declare loading groups anywhere in the snapshot, including in unreferenced subtrees; previously those subtrees were ignored.
If capture is rejected for loading groups, use a regular online container load instead; this capture API does not yet support those containers.
