---
"@fluidframework/container-runtime-definitions": minor
"__section": legacy
---
Expose the version mark resolver on IContainerRuntime

`IContainerRuntime` now exposes `versionMarkResolver: IVersionMarkResolver`, the supported access point for the version mark resolver APIs (`IVersionMarkResolver`, `ResolveResult`, `VersionMarkCapture`), which move to `@fluidframework/container-runtime-definitions`. Hosts obtain the resolver from the runtime instead of the concrete `ContainerRuntime` class.
