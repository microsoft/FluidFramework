---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": feature
---
Settled change notification

`LocalChangeMetadata` now exposes an `events: Listenable<LocalCommitEvents>` property that fires a `"settled"` event once a commit has been ordered by the sequencing service.

Once a commit is sequenced, the following guarantees hold:
1. The changes carried by the commit have been persisted and other peers are able to see them.
2. There can be no more concurrent changes sequenced before this commit, which means this commit has reached its settled form.

The `"settled"` event provides details about the outcome of applying this settled form.
