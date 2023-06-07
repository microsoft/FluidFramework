# @fluidframework/driver-definitions

## 2.0.0-internal.5.0.0

### Major Changes

-   IResolvedUrl equivalent to IFluidResolvedUrl [8b242fdc79](https://github.com/microsoft/FluidFramework/commits/8b242fdc796714cf1da9ad3f90d02efb122af0c2)

    In @fluidframework/driver-definitions, IResolvedUrlBase and IWebResolvedUrl have now been removed.

    This makes IResolvedUrl and IFluidResolvedUrl equivalent. Since all ResolvedUrls are now FluidResolvedUrls we no longer
    need to differentiate them. In @fluidframework/driver-utils isFluidResolvedUrl and ensureFluidResolvedUrl have been
    removed due to this.

## 2.0.0-internal.4.4.0

Dependency updates only.

## 2.0.0-internal.4.1.0

Dependency updates only.
