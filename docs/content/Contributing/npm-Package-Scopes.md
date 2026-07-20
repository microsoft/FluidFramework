@fluidframework
----------------

Packages that are part of the platform itself, including platform DDSes, protocol definitions, shared interfaces, as well as reference implementations of components of the system (e.g. Routerlicious). This is the "default" scope for packages in the FluidFramework repo.

@fluid-tools
----------------

Public packages containing tools developed within the Fluid Framework repo that may be of general use to Fluid and/or JavaScript developers.

@fluid-internal
---------------

Packages containing libraries meant **only for use between packages within the Fluid Framework**. This means that these packages may contain changes that are not aligned with semver (i.e. they can contain "breaking changes" in minor releases). Packages with this scope are not published to npm by default, but they are published to internal feeds. To publish packages with this scope, add the package to the `policy.packageNames.mustPublish.npm` list in the root fluidBuild config.

@fluid-private
----------------

Private packages (i.e. should NOT be published) used internally within the Fluid Framework repo. These packages contain infrastructure that can only be used by the Fluid Framework team. This carries with it a lower commitment to stable APIs because breaking changes can only affect the FluidFramework repository. These packages are not published by default, even internally, except for some exceptions to facilitate validation pipelines.

**Historical note:** This scope was formerly @fluid-internal. Yes, it is confusing, but in the past we called our private, never-published packages "internal." We now know that was a mistake. 😄

@fluid-experimental
-------------------

Packages that are experimental and should not be used in critical scenarios. We use this scope when we're not sure if a package should be included in the platform SDK. Some platform packages will start in this scope and be renamed and published under the @fluidframework scope once the package is no longer considered experimental.

fluid-framework
----------------

This is a package that re-exports the official "public API" for GA. Everything exposed through this package is also exposed in a @fluidframework package.

tinylicious
------------

This is the server version of the tinylicious package. Installed/run via `npx tinylicious`.

Package Deprecation Policy
----------------

@fluidframework, fluid-framework and tinylicious follow the [deprecation policy](./API-Deprecation.md). Packages that do not conform to the policy can be removed without following the [deprecation policy](./API-Deprecation.md)
