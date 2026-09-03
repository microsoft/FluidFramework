---
"@fluidframework/container-runtime-definitions": minor
"@fluidframework/container-runtime": minor
"__section": legacy
---
Expose the version mark resolver on IContainerRuntime

`IContainerRuntime` now exposes `versionMarkResolver: IVersionMarkResolver`, the supported access point for the version mark resolver APIs (`IVersionMarkResolver`, `ResolveResult`, `VersionMarkCapture`), which move to `@fluidframework/container-runtime-definitions`. Hosts obtain the resolver from the runtime instead of the concrete `ContainerRuntime` class.

`ResolveResult`'s `pending` and `unresolvable` results also gain an optional `reason?: string`, an opaque diagnostic string for logging only. Hosts drive behavior from `kind`; `reason` is not a contract and must not be branched on.
