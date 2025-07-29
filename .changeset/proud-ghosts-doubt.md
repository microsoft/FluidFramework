---
"@fluidframework/container-runtime": minor
"@fluidframework/runtime-utils": minor
"__section": deprecation
---
Moved MinimumVersionForCollab to @fluidframework/runtime-utils

MinimumVersionForCollab has been moved from @fluidframework/container-runtime to @fluidframework/runtime-utils.
The export in @fluidframework/container-runtime is now deprecated and will be removed in a future version.
Consumers should import it from @fluidframework/runtime-utils going forward.
