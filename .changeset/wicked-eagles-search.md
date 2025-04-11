---
"@fluidframework/odsp-driver": minor
"__section": deprecation
---

The `containerPackageInfo` parameter in `createOdspCreateContainerRequest()` is now deprecated.

The `containerPackageInfo` parameter in `createOdspCreateContainerRequest()` is deprecated will be removed in version 2.40.0.

The name of the containerPackage can no longer be sent through the request. Instead, it can be added in the constructor of `OdspDriverUrlResolverForShareLink`.

See [issue #23882](https://github.com/microsoft/FluidFramework/issues/23882) for details.
