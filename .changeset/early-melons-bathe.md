---
"@fluidframework/container-loader": minor
---

IDetachedBlobStorage is deprecated and replaced with a default in memory store for detached blobs

IDetachedBlobStorage will be removed in a future release without a replacement.

When applications load a container without specifying ILoaderServices.detachedBlobStorage, an implementation which stores the blobs in memory will be injected by Fluid.

IDetachedBlobStorage as well as application-defined implementations of it are deprecated and support will be removed for them in a future update.
Applications are recommended to stop providing this property on ILoaderServices.
