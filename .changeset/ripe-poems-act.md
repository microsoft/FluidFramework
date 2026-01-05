---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": breaking
---
TreeBranch operations throw when called during transactions

This breaking change only affects the behavior of `TreeBranch` methods (currently released as beta).
* Invoking `TreeBranch.fork()` now throws an error if a transaction is ongoing on the branch.
* Invoking `TreeBranch.merge(sourceBranch)` now throws an error if a transaction is ongoing on the source branch.
  As before, it also throws an error if a transaction is ongoing on the target (i.e., `this`) branch.
* Invoking `TreeBranch.rebaseOnto(targetBranch)` now throws an error if a transaction is ongoing on the target branch.
  As before, it also throws an error if a transaction is ongoing on the source (i.e., `this`) branch.

These new restrictions insulate branches and their dependents from experiencing incomplete transaction changes.
This is important because incomplete transaction changes may not uphold application invariants.

In scenarios that experience the new errors, application authors should consider whether the ongoing transaction can safely be closed before invoking these methods.
