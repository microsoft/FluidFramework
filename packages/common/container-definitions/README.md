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

When taking a dependency on a Fluid Framework library's public APIs, we recommend using a `^` (caret) version range, such as `^1.3.4`.
While Fluid Framework libraries may use different ranges with interdependencies between other Fluid Framework libraries,
library consumers should always prefer `^`.

If using any of Fluid Framework's unstable APIs (for example, its `beta` APIs), we recommend using a more constrained version range, such as `~`.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
