---
"@fluidframework/aqueduct": major
---

EventForwarder and IDisposable members removed from PureDataObject

The `EventForwarder` and `IDisposable` members of `PureDataObject` were deprecated in 2.0.0-internal.5.2.0 and have now been removed.

If your code was overriding any methods/properties from `EventForwarder` and or `IDisposable` on a class that inherits
(directly or transitively) from `PureDataObject`, you'll have to remove the `override` keyword.
