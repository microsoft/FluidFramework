---
"@fluidframework/tree": minor
"__section": tree
---
Add an opt-in postProcessor option when running a transaction

`RunTransactionParams` now accepts an optional `postProcessor` (used by `runTransaction` and `runTransactionAsync`). When supplied, the edits made during the transaction are post-processed when the transaction is committed, transforming the resulting squashed change. For example, post-processing could be used to "minimize" the change so that it contains no extraneous information. Such extraneous information includes data for nodes that were both created and removed within the transaction, or changes whose effects cancel out to nothing.

`postProcessor` is a type-erased handle (`TransactionPostProcessor`) whose concrete representation is an implementation detail of `@fluidframework/tree`. It is opt-in: when it is omitted the existing behavior is preserved.

Note: minimization is the first intended implementation and use of post-processing, but it is not yet available.
