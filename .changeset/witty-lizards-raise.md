---
"@fluidframework/runtime-definitions": minor
"@fluidframework/test-runtime-utils": minor
"__section": legacy
---
Types not intended for consumer implementation/extension are now @sealed

The following types are now explicitly marked as `@sealed` to indicate that they are not intended for consumer implementation or extension.

- `MockFluidDataStoreRuntime` class in `@fluidframework/test-runtime-utils`
- `IFluidParentContext` interface in `@fluidframework/runtime-definitions`
- `IFluidDataStoreContext` interface in `@fluidframework/runtime-definitions`
- `IFluidDataStoreContextDetached` interface in `@fluidframework/runtime-definitions`
