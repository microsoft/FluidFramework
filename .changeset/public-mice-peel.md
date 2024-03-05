---
"@fluidframework/datastore-definitions": minor
---

Add TChannel type parameter to IChannelFactory.

Add TChannel type parameter (which defaults to IFluidLoadable) to IChannelFactory. When left at its default this preserves the old behavior, however packages exporting IChannelFactory will now reference IFluidLoadable if not providing a different parameter and thus will implicitly depend on @fluidframework/core-interfaces.
