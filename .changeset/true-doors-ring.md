---
"@fluidframework/container-loader": minor
---
---
"section": feature
---

Blobs in Detached Container Supported by Default

It is no longer necessary or supported to provide `detachedBlobStorage` to the Loader. This functionality is now provided by default, and the deprecated `IDetachedBlobStorage` will be removed in the 2.40.0 release.
The new behavior can be disabled by setting `Fluid.Container.MemoryBlobStorageEnabled` to `false`. This flag will also be removed in the 2.40.0 release if no issues are reported.
