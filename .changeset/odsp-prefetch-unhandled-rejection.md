---
"@fluidframework/odsp-driver": minor
"__section": fix
---
Failed snapshot prefetches and cache writes no longer cause unhandled promise rejections

[`prefetchLatestSnapshot`](https://fluidframework.com/docs/api/odsp-driver/#prefetchlatestsnapshot-function) returns `false` when it can't fetch the snapshot.
Before this fix, the failure could also cause an unhandled promise rejection, for example when the `odspDocumentServiceFactory` argument wasn't given.

The driver writes each snapshot that it downloads to the host's persisted cache.
Before this fix, if that write failed, the failure also caused an unhandled promise rejection.
This could happen when loading a container or when prefetching a snapshot.
