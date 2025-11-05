---
"@fluidframework/core-interfaces": minor
"@fluidframework/container-definitions": minor
"__section": legacy
---
Added a new Fluid error type layerIncompatibilityError

A new Fluid error type `layerIncompatibilityError` is added to `FluidErrorTypesAlpha` as @legacy @alpha. This will be moved to `FluidErrorTypes` as @legacy @beta in a future legacy breaking release.
It will also be added to `ContainerErrorTypes` since it extends `FluidErrorTypes`.
