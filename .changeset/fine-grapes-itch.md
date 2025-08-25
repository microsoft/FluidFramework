---
"@fluidframework/aqueduct": minor
"@fluidframework/container-runtime": minor
"@fluidframework/container-runtime-definitions": minor
"@fluidframework/datastore": minor
"@fluidframework/datastore-definitions": minor
"@fluidframework/runtime-definitions": minor
"@fluidframework/runtime-utils": minor
"@fluidframework/shared-object-base": minor
"@fluidframework/test-runtime-utils": minor
"@fluidframework/test-utils": minor
"__section": feature
---
The `minVersionForCollab` on the Container is now available in the Datastore layer

`minVersionForCollab` is now passed down from the ContainerRuntime to the Datastore layer where it is made available for SharedObject construction.
DDSes may optionally consume this value and use it to determine which sets of feature flags should be enabled.
