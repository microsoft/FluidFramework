---
"@fluidframework/odsp-driver": minor
"__section": breaking
---
OdspFluidDataStoreLocator optional properties may also be explicitly undefined

Typing for `OdspFluidDataStoreLocator` optional properties are updated to reflect that in some implementations those are present but evaluate to `undefined`.
When building with `excactOptionalPropertyTypes:false` as suggested in [compatibility requirements](https://github.com/microsoft/FluidFramework/blob/68732d93a6cc8be2df966b9bb40f58bdd9fad69b/packages/drivers/odsp-driver/README.md#supported-tools), there is no apparent type change.
If a type error is experienced, make sure to check for `undefined` when reading.
