# @fluidframework/test-utils

## 2.0.0-internal.5.0.0

### Major Changes

-   ensureSynchronizedWithTimeout removed from LoaderContainerTracker [8b242fdc79](https://github.com/microsoft/FluidFramework/commits/8b242fdc796714cf1da9ad3f90d02efb122af0c2)

    In @fluidframework/test-utils, `LoaderContainerTracker.ensureSynchronizedWithTimeout` has been removed, as it is
    equivalent to `LoaderContainerTracker.ensureSynchronized`. The `timeoutDuration` parameter from
    `TestObjectProvider.ensureSynchronized` has also been removed. Configure the timeout for the test instead.

## 2.0.0-internal.4.4.0

Dependency updates only.

## 2.0.0-internal.4.1.0

Dependency updates only.
