---
"@fluidframework/container-definitions": minor
"@fluidframework/container-loader": minor
---
---
"section": deprecation
---

IContainer.getContainerPackageInfo() is now deprecated

`IContainer.getContainerPackageInfo()` is now deprecated, and will be removed in a future release to clean up API surface. It is superfluous since package name and more is available from `IContainer.getLoadedCodeDetails()`.
To access the package name that `getContainerPackageInfo()` currently provides, use `IFluidCodeDetails.package` returned by `IContainer.getLoadedCodeDetails()`. Example:

before:
``` typescript
function getLoadedPackageName(container: IContainer): string | undefined {
const pkg = container.getContainerPackageInfo();
if (pkg === undefined) return undefined;
return typeof pkg === "object" ? pkg.name : pkg;
}
```
after:
``` typescript
function getLoadedPackageName(container: IContainer): string | undefined {
const pkg = container.getLoadedCodeDetails()?.package;
if (pkg === undefined) return undefined;
return typeof pkg === "object" ? pkg.name : pkg;
}
```
