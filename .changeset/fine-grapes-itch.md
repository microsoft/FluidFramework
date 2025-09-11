---
"@fluidframework/datastore": minor
"@fluidframework/runtime-definitions": minor
"@fluidframework/test-runtime-utils": minor
"__section": feature
---
`minVersionForCollab` is now available on `IFluidDataStoreContext`

`minVersionForCollab` is now passed down from the `ContainerRuntime` to the Datastore layer where it is made available for
`SharedObject` construction.
DDSes may optionally consume this value and use it to determine which sets of feature flags should be enabled.

#### Public type changes

- **@fluidframework/datastore: `FluidDataStoreRuntime`** - Exposes `minVersionForCollab`.
- **@fluidframework/runtime-definitions: `IFluidDataStoreContext`** - Exposes optional member `minVersionForCollab`.
See `FluidDataStoreContext` for an example implementation.
- **@fluidframework/test-runtime-utils: `MockFluidDataStoreContext`, `MockFluidDataStoreRuntime`** - Exposes `minVersionForCollab`
either via a getter or as a readonly field.

Note that the new implementations are optional fields and in some cases accept `undefined`.
This is needed for layer compatibility, and in a future release these members will no longer be optional.
