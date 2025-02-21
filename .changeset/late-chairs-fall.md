---
"@fluidframework/container-definitions": minor
"@fluidframework/container-loader": minor
---
---
"section": deprecation
---

The IContainer.getContainerPackageInfo() on IContainer is now deprecated

IContainer.getContainerPackageInfo(), that is typed as optional, is superfluous as package name and more is available from IContainer.getLoadedCodeDetails(). It is being removed to clean up API surface.

IContainer.getContainerPackageInfo() will be removed.
To access package name getContainerPackageInfo provided, use IFluidCodeDetails.package returned by IContainer.getLoadedCodeDetails(). Example helper:

function getLoadedPackageName(container: IContainer): string | undefined {
const pkg = container.getLoadedCodeDetails()?.package;
if (pkg === undefined) return undefined;
return typeof pkg === "object" ? pkg.name : pkg;
}
