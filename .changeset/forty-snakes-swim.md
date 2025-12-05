---
"@fluidframework/container-definitions": minor
"__section": legacy
---
Some keys in IFluidCodeDetailsConfig are now reserved for Fluid Framework use

The keys of [`IFluidCodeDetailsConfig`](https://fluidframework.com/docs/api/container-definitions/ifluidcodedetailsconfig-interface)
(the [type of the `config` property on `IFluidCodeDetails`](https://fluidframework.com/docs/api/container-definitions/ifluidcodedetails-interface#config-propertysignature))
used to be entirely free for consumer use.
Going forward, keys with the `"FluidFramework."` prefix are reserved for Fluid Framework's internal use.

We do not expect this to affect any consumers.
