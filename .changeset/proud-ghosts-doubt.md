---
"@fluidframework/container-runtime": minor
"@fluidframework/runtime-utils": minor
"__section": deprecation
---
Moved MinimumVersionForCollab to @fluidframework/runtime-definitions

MinimumVersionForCollab has been moved from @fluidframework/container-runtime to @fluidframework/runtime-definitions.
The export in @fluidframework/container-runtime is now deprecated and will be removed in a future version.
Consumers should import it from @fluidframework/runtime-definitions going forward.
