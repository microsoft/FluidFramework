---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Editing a SharedTree during its change-event callbacks now consistently throws

Editing a `SharedTree` from inside one of its change-event callbacks has always been forbidden, but some paths were not being caught: edits and the start of a transaction (along with branch operations, reverts, etc.) made while the tree was emitting its post-change notification ran to completion instead of throwing.

Such edits would apply to the tree, trigger further change notifications, and could re-enter the same listener for the resulting commits.
This can produce infinite edit loops, redundant work across clients, incorrect attribution, broken undo/redo grouping, and pollution of the outer commit's label data.

This release closes those gaps: both editing the tree and starting a transaction during a change-event callback now throw the same canonical `UsageError` as the other change-event callbacks:

> Editing the tree is forbidden during a change event callback

> Running a transaction is forbidden during a change event callback

More generally, edits should not be made in response to changes to the document.
See [Editing in response to change events](https://fluidframework.com/docs/data-structures/tree/events#editing-in-response-to-change-events) for why, and for the recommended alternatives.
