---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Starting a transaction during a change-event callback now throws

Building on the change-event edit lock, starting a transaction from inside one of a `SharedTree`'s change-event callbacks is now forbidden, the same as the direct edits that were already blocked.

Previously the edit-time lock did not cover the start of a transaction, so a `runTransaction` (or `runTransactionAsync`) begun from within a change-event listener ran instead of being rejected. It now hits the same guard as every other edit:

- `runTransaction` throws a `UsageError`, and
- `runTransactionAsync` rejects with one.

> Running a transaction is forbidden during a change event callback

See [Editing in response to change events](https://fluidframework.com/docs/data-structures/tree/events#editing-in-response-to-change-events) for why edits should not be made in response to changes.
