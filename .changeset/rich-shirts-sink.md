---
"@fluidframework/datastore-definitions": minor
---

Remove Unused IFluidDataStoreRegistry From IFluidDataStoreRuntime"

IFluidDataStoreRuntime optionally extended IFluidDataStoreRegistry. This is never used, so is removed. As with all provider interfaces, consumers can continue to extend the interface if they have a use, and use FluidObject to inspect for it existing.
