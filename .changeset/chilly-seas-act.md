---
"@fluidframework/test-utils": major
---

ensureSynchronizedWithTimeout removed from LoaderContainerTracker

`LoaderContainerTracker.ensureSynchronizedWithTimeout` has been removed, as it is equivalent to `LoaderContainerTracker.ensureSynchronized`. The `timeoutDuration` parameter from `TestObjectProvider.ensureSynchronized` has also been removed. Please configure the timeout for the test instead.
