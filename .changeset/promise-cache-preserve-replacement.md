---
"@fluidframework/core-utils": minor
"__section": fix
---
Preserve replacement cache entries when earlier work fails

When pending work is removed from a [`PromiseCache`](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-utils/src/promiseCache.ts) and replaced, a later rejection from the removed work no longer removes the replacement entry.
