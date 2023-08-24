# @fluidframework/container-definitions

This package contains the interfaces and types concerning the Loader and loading the Container.

Some important interfaces in here include:

-   **ILoader, IContainer** - Interfaces allowing the Host to load and interact with a Container
-   **IContainerContext** - Proxy between the Host and the running instance of a Container,
    which allows the code supporting the running Container to be swapped out during a session.
-   **IRuntime / IRuntimeFactory** - Contract necessary for the ContainerContext to "boot" a Container at runtime.
-   **IDeltaManager / IDeltaQueue** - Abstraction over the Container's view of the ops being transmitted to/from storage.

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
