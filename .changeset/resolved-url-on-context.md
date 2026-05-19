---
"@fluidframework/container-definitions": minor
"@fluidframework/container-loader": minor
"__section": legacy
---
Expose `resolvedUrl` on `IContainerContext`

`IContainerContext` now carries an optional
`resolvedUrl?: IResolvedUrl | undefined` property, mirroring
`IContainer.resolvedUrl` on the runtime side. Runtime code can read document
identity (including driver-specific fields carried on the driver's resolved URL
subtype) directly from the context, instead of routing through
`IContainerContext.getAbsoluteUrl` and the URL resolver.

`resolvedUrl` is `undefined` only while the container is in the detached state.
