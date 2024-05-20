---
"@fluidframework/container-loader": minor
---

IDetachedBlobStorage is deprecated and replaced with a default in memory store for detached blobs

IDetachedBlobStorage will be removed in a future release without a replacement. Blobs created while detached will be stored in memory to align with attached container behavior. AB#8049
