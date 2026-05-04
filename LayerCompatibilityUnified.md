# Fluid Framework Layer Compatibility Unified

This is a alternative to the [Fluid Framework Layer Compatibility](./LayerCompatibility.md) (which applies mainly to `@legacy` APIs).
This new approach is intentionally less flexible, but should still be flexible enough for most of not all use-cases, and possible to extend to cover more use-cases later if required.

## Overview

This system addresses two key scenarios:

1. **Dynamic/Lazy loading**:
    -   Drivers Selection: Applications may lazily or dynamically load a specific ServiceClient, allowing a single build of an application to support multiple services without downloading unnecessary code.
    -   TODO: it should be possible to load the minimal amount of code needed to start connecting to a service, the connect and load additional code in parallel (which can also be prefetched).
    -   TODO: It should be possible to load the minimal amount of code to select a document to load. When actually initiating the load of the document, this should download the additional service specific and shared runtime code necessary. Additionally this lazily loaded code should be easy to prefetch (exposed as a simple static async API in the service client's module), and able to happen in parallel with connection to the service, and ideally download of the initial document contents (API should make that possible: but might be a future optimization).
    -   TODO: we should make an example do the above mentioned TODO cases a best as currently possible.
    -   DataStoreKind loading: Registry API supports dynamically loading the code implementing the DataStoreKind based on its identifier when first resolved in the document.

2. **Multi-repo development**: Applications often import and build from multiple repositories that release on different cadences. So long as the supported dependency ranges they require for the Fluid Framework Client packages overlap (Typically ranges like `^2.100`), releases from multiple repositories can be mixed together into a single release. If desired, the deployment scheme can bundle the Fluid Framework Client code (and likely other second and third party packages) into separate bundles which can be updated independently so long as the semver compatibility ranges are respected.

Should this be too inflexible, future versions of the API could relax the constraints further.
For example the common service-client interfaces and the portion of their implementations that is needed before a container is loaded could be decoupled from the runtime portion. A relatively type safe way to do this would be to provide an alternate entry point for customers desiring this separation, where they would dependency inject loader (async function) for the rest of the code (which could be eager or lazy as they desire), and we would ensure that the TypeScript typing of this API as well as any package dependency version ranges accurately captured the actual compatibility requirements.

## Layer Boundaries and Validation

Structural types should be used when multiple implementations, either written by third parties, or from other versions of packages are allowed.
`@sealed` Nominal types (Like `ErasedTypeBase` and `ErasedType`) should be used when multiple versions are not supported, and instead a single specific implementation from a specific expected version must be used (and thus could be down cast to expose functionality not part of the type).
This ensures that TypeScript type checking validates that any version mixing and package duplication being done is actually a supported configuration, at compile time.

If needed, it is possible to explicitly design types to they can support specific ranges of versions of other packages.
For example is supporting a type from one version of another package (no mixing), the range of supported versions can be expressed using the packages's dependency range on the package in question, then directly refer to a nominal type in that package.
If needing to support a range of versions, but allow multiple package versions at once as long as all are in that range, either structural types detailing the actual requirements can be used, or opaque branded structural types can be used which include version brands.

In a cases where dynamic loading which might be done in non-type safe ways, or where a type safe solution was not found, additional runtime checks should be added similar to those used to check the legacy API surface's layering.
