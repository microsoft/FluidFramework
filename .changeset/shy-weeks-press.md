---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Fixed bug in no-change constraint revert precondition

The [`no-change` constraint](https://fluidframework.com/docs/api/fluid-framework/nochangeconstraint-interface),
when evaluated as a [precondition to revert](https://fluidframework.com/docs/api/fluid-framework/transactioncallbackstatusalpha-typealias),
is now violated by concurrent changes made to already removed content.
Before this version, it was only violated by concurrent changes made in the document tree.
This shift makes the behavior of the constraint consistent across revert and non-revert usages.
