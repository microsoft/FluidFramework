---
"@fluidframework/container-definitions": major
"@fluidframework/container-loader": major
"@fluidframework/container-runtime": major
---

getPendingLocalState and closeAndGetPendingLocalState are now async.

getPendingLocalState and closeAndGetPendingLocalState are now async to allow uploading blobs to attach to a DDS (in closing scenario). There is a new parameter in those methods at the container/runtime layer "notifyImminentClosure" which is true only when closing and ensures uploading blobs fast resolve and get attached. Once we apply stashed ops to new container, blob will try to reupload and we will know where to place its references.
