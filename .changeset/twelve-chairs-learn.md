---
"@fluidframework/runtime-definitions": minor
---

Make IInboundSignalMessage alpha and readonly

Users of `IInboundSignalMessage` will need to import it from the `/legacy` scope and should not mutate it.
Only users of existing `@alpha` APIs like `IFluidDataStoreRuntime` should be able to use this type, so it should not introduce new `/legacy` usage.
