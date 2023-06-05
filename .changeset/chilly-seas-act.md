---
"@fluidframework/test-utils": major
---

ensureSynchronizedWithTimeout removed from LoaderContainerTracker

In @fluidframework/test-utils, `LoaderContainerTracker.ensureSynchronizedWithTimeout` has been removed, as it is
equivalent to `LoaderContainerTracker.ensureSynchronized`. The `timeoutDuration` parameter from
`TestObjectProvider.ensureSynchronized` has also been removed. Configure the timeout for the test instead.
