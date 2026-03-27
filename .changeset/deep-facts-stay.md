---
"@fluidframework/aqueduct": minor
"@fluidframework/datastore": minor
"@fluidframework/runtime-definitions": minor
"@fluidframework/shared-object-base": minor
"@fluidframework/test-runtime-utils": minor
"@fluidframework/test-utils": minor
"__section": breaking
---
minVersionForCollab is now non-optional

This change is a follow-up for [pull request 25130](https://github.com/microsoft/FluidFramework/pull/25130)
which was released as part of [2.61.0](https://github.com/microsoft/FluidFramework/releases/tag/client_v2.61.0).

The `minVersionForCollab` property has been made non-optional in the following `@legacy` interfaces in the Runtime layer:

- `IFluidParentContext.minVersionForCollab` in `@fluidframework/runtime-definitions`.
- `IFluidDataStoreContext.minVersionForCollab` in `@fluidframework/runtime-definitions`.
- `IFluidDataStoreContextDetached.minVersionForCollab` in `@fluidframework/runtime-definitions`.

Consumers of Fluid aren't expected to implement these interfaces directly, so no impact is expected.

Additionally the following properties now always return a value, rather than possibly returning `undefined`:

- `FluidDataStoreRuntime.minVersionForCollab` in `@fluidframework/datastore`.
Note that this is a beta-breaking change, though FluidDataStoreRuntime is not intended to be extended directly outside
of a known legacy use-case.
- `MockFluidDataStoreRuntime.minVersionForCollab` in `@fluidframework/test-runtime-utils`.
- `IDataObjectProps.context.minVersionForCollab` in `@fluidframework/aqueduct`.
- `ITestFluidObject.context.minVersionForCollab` in `@fluidframework/test-utils`
- `IProvideTestFluidObject.ITestFluidObject.context.minVersionForCollab` in `@fluidframework/test-utils`
