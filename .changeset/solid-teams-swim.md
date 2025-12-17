---
"@fluidframework/container-definitions": minor
"@fluidframework/core-interfaces": minor
"@fluidframework/driver-definitions": minor
"@fluidframework/odsp-driver-definitions": minor
"__section": breaking
---
Added layerIncompatibilityError to FluidErrorTypes, ContainerErrorTypes, DriverErrorTypes and OdspErrorTypes

The Fluid error type `layerIncompatibilityError` is added to `FluidErrorTypes` and is now @legacy @beta. It is also added to `ContainerErrorTypes`, `DriverErrorTypes` and `OdspErrorTypes` which extend `FluidErrorTypes`.
`layerIncompatibilityError` was added as @legacy @alpha in version 2.72.0.
The corresponding interface `ILayerIncompatibilityError` for errors of type `layerIncompatibilityError` is now also @legacy @beta.

See [this issue](https://github.com/microsoft/FluidFramework/issues/25813) for more details.
