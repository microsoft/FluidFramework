---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Bug fix: revert preconditions no longer cause document corruption and other errors

Before this release, when a SharedTree client specified a [constraint](https://fluidframework.com/docs/data-structures/tree/transactions#constraints) as a [precondition for a revert](https://fluidframework.com/docs/api/fluid-framework/transactioncallbackstatusalpha-typealias) and (whether or not a revert was performed) such a constraint was violated,
that client could later error during the rebasing of its shared branches (when processing peer changes) or local branches
and was liable to generate invalid edits that would cause document corruption in the meantime.
