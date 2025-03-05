---
"@fluidframework/odsp-driver": minor
---
---
"section": deprecation
---

createOdspCreateContainerRequest().containerPackageInfo is now deprecated

The parameter `containerPackageInfo` in `createOdspCreateContainerRequest()` is deprecated and will be removed in version 2.40.

This will mean that the name of the containerPackage can no longer be sent through the request. Instead it can be added in the constructor of `OdspDriverUrlResolverForShareLink`.

 See [issue] (https://github.com/microsoft/FluidFramework/issues/23882) for details.
