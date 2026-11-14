---
"@fluidframework/odsp-driver": minor
"__section": fix
---
Failed snapshot prefetches no longer cause unhandled promise rejections

[`prefetchLatestSnapshot`](https://fluidframework.com/docs/api/odsp-driver/#prefetchlatestsnapshot-function) returns `false` when it can't fetch the snapshot.
Before this fix, the failure could also cause an unhandled promise rejection, for example when the `odspDocumentServiceFactory` argument wasn't given.
