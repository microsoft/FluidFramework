---
"@fluidframework/aqueduct": minor
"@fluidframework/container-runtime": minor
"@fluidframework/fluid-static": minor
"@fluid-private/test-end-to-end-tests": minor
"@fluidframework/test-utils": minor
"@fluid-private/test-version-utils": minor
"__section": deprecation
---
Removed deprecated export of MinimumVersionForCollab from @fluidframework/container-runtime

Removed the deprecated re-export of MinimumVersionForCollab from @fluidframework/container-runtime.
This type should now be imported from @fluidframework/runtime-definitions.
See the [Fluid Framework 2.52.0 release notes](https://github.com/microsoft/FluidFramework/releases/tag/client_v2.52.0) for details.
