# @fluid-internal/client-utils

This package is intended for sharing and promoting utility functions across packages in the Fluid Framework repo,
primarily within the client release group.

Use outside of the Fluid Framework repo is not supported or recommended.

## Adding code to this package

As a utility package, this package does not have a strong identity. This means that it's easy to become a "dumping
ground" for code that we think we should share but doesn't have an obvious home. We try to avoid dumping things into
utility packages, and this one is no exception.

New code should only be added to this package in rare circumstances. In most cases, the code would be better placed in a
package with a clear identity (e.g. an "events" package for shared event infrastructure) or not shared at all.

## Requirements

This package has important requirements for the code within it.

1. Code within this package should require some external dependencies. If it does not, then the **core-utils** package
   is a better location.
1. **All exports must be designated `@internal`.** This code is intended for use within the Fluid Framework only.
1. This package should **only contain 'implementation' code, not type definitions.** This is the most flexible rule, and
   there are some exceptions. If the type is _only_ necessary when using this package, then it is probably OK. However,
   usually such types would be better placed in core-interfaces or in a package that corresponds to the purpose.

If you want to add code that does not meet these requirements, these other packages may be a better choice:

-   **Types and interfaces** that are intended to be broadly shared across the client release group should be put in the
    **core-interfaces** package.
-   **Zero-dependency shared code** should be put in the **core-utils** package.

<!-- AUTO-GENERATED-CONTENT:START (README_DEPENDENCY_GUIDELINES_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Using Fluid Framework libraries

When taking a dependency on a Fluid Framework library, we recommend using a `^` (caret) version range, such as `^1.3.4`.
While Fluid Framework libraries may use different ranges with interdependencies between other Fluid Framework libraries,
library consumers should always prefer `^`.

Note that when depending on a library version of the form `2.0.0-internal.x.y.z`, called the Fluid internal version scheme,
you must use a `>= <` dependency range (such as `>=2.0.0-internal.x.y.z <2.0.0-internal.w.0.0` where `w` is `x+1`).
Standard `^` and `~` ranges will not work as expected.
See the [@fluid-tools/version-tools](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/version-tools/README.md)
package for more information including tools to convert between version schemes.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

<!-- AUTO-GENERATED-CONTENT:START (README_TRADEMARK_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand
Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
