---
"@fluidframework/container-loader": minor
"__section": fix
---
Preserve unreferenced data stores in captured container state

`captureFullContainerState` retains all structural snapshot contents, including unreferenced data stores and their DDSs.
This lets a resumed session process operations that reference these stores again without fetching historical structural blobs from storage.
Containers with loading groups in unreferenced subtrees are rejected instead of producing incomplete captured state.
Attachment capture behavior is unchanged.
