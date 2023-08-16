---
"@fluidframework/aqueduct": minor
---

PureDataObject temporarily extends EventForwarder and implements IDisposable again

`PureDataObject` extends `EventForwarder` and implements `IDìsposable` again to ease the transition to `2.0.0-internal.6.x`.
These interfaces will no longer be implemented on `PureDataObject` in version `2.0.0-internal.7.0.0`.

The original deprecation announcement for these members can be found [here](https://github.com/microsoft/FluidFramework/releases/tag/client_v2.0.0-internal.5.2.0).

Once the change is re-applied in `2.0.0-internal.7.0.0`, if your code was overriding any methods/properties from
`EventForwarder` and or `IDisposable` on a class that inherits (directly or transitively) from `PureDataObject`,
you'll have to remove the `override` keyword.
