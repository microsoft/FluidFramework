---
"@fluidframework/runtime-definitions": minor
"@fluidframework/container-runtime-definitions": minor
"@fluidframework/container-runtime": minor
"__section": legacy
---
Expose the version mark resolver on IContainerRuntimeBase

`IContainerRuntimeBase` now exposes `versionMarkResolver: IVersionMarkResolver`, the supported access point for the version mark resolver APIs ([`IVersionMarkResolver`](https://fluidframework.com/docs/api/runtime-definitions/iversionmarkresolver-interface), [`ResolveResult`](https://fluidframework.com/docs/api/runtime-definitions/resolveresult-typealias), [`VersionMarkCapture`](https://fluidframework.com/docs/api/runtime-definitions/versionmarkcapture-typealias)), which now live in `@fluidframework/runtime-definitions`. Hosts and data stores obtain the resolver from the runtime instead of the concrete `ContainerRuntime` class.

`ResolveResult`'s `pending` and `unresolvable` results also gain an optional `reason?: string`, an opaque diagnostic string for logging only. Hosts drive behavior from `kind`. `reason` is not a contract and must not be branched on.
