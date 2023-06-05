---
"@fluidframework/container-loader": major
"@fluidframework/driver-definitions": major
"@fluidframework/driver-utils": major
"@fluidframework/local-driver": major
---

IResolvedUrl equivalent to IFluidResolvedUrl

In @fluidframework/driver-definitions IResolvedUrlBase and IWebResolvedUrl have now been removed.

This makes IResolvedUrl and IFluidResolvedUrl equivalent. Since all ResolvedUrls are now FluidResolvedUrls we no longer need to differentiate them. In @fluidframework/driver-utils isFluidResolvedUrl and
ensureFluidResolvedUrl have been removed due to this.
