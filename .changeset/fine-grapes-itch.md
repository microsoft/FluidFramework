---
"@fluidframework/datastore": minor
"@fluidframework/datastore-definitions": minor
"@fluidframework/runtime-definitions": minor
"@fluidframework/test-runtime-utils": minor
"__section": feature
---
`minVersionForCollab` is now available on `IFluidDataStoreContext`

`minVersionForCollab` is now passed down from the `ContainerRuntime` to the Datastore layer where it is made available for
`SharedObject` construction.
DDSes may optionally consume this value and use it to determine which sets of feature flags should be enabled.

#### Interface changes

All implementers of `IFluidDataStoreContext` should forward the `minVersionForCollab`
value. Constraints for the interfaces that now provide the value via accessors or fields:

- **@fluidframework/runtime-definitions: `IFluidDataStoreContext`** - Implementation (`FluidDataStoreContext`) must read
`minVersionForCollab` from `IFluidParentContextPrivate` (class member).

Note that the new implementations are either optional accessors, can return undefined, or both.
This is needed layer compatibility, and in a future release these members will no longer be optional or return
values that may be undefined.
