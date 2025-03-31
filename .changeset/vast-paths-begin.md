---
"@fluidframework/datastore": minor
"@fluidframework/test-runtime-utils": minor
---
---
"section": legacy
includeInReleaseNotes: false
---

New ILayerCompatDetails property on FluidDataStoreRuntime, MockFluidDataStoreContext and MockFluidDataStoreRuntime

A new optional property, `ILayerCompatDetails`, has been added to `FluidDataStoreRuntime`. This property is used by
`FluidDataStoreContext` in the Runtime layer to validate that the Runtime and DataStore layers are compatible.

`ILayerCompatDetails` has also been added to `MockFluidDataStoreRuntime` and `MockFluidDataStoreContext` which are used for
testing.

Important: this property is intended for use by Fluid Framework code only. No code outside the Fluid Framework should use or depend on this property in any way.
