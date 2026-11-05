---
"@fluidframework/core-utils": minor
"__section": fix
---
Preserve replacement cache entries when earlier work fails

When pending work is removed from a `PromiseCache` and replaced, a later rejection from the removed work no longer removes the replacement entry.
