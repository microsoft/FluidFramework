---
"@fluidframework/odsp-driver": minor
---
---
"section": deprecation
---

Deprecate the `containerPackageInfo` parameter in `createOdspCreateContainerRequest()` is deprecated and will be removed in version 2.40.

The name of the containerPackage can no longer be sent through the request. This functionality will be removed in version 2.40.
Instead it can be added in the constructor of `OdspDriverUrlResolverForShareLink`.

See [issue](https://github.com/microsoft/FluidFramework/issues/23882) for details.
