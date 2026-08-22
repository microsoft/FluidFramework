---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
New alpha APIs for inspecting history and restoring past states

`UntypedTreeViewAlpha` now exposes a `branchHistory` property which returns a `TreeBranchHistory` object with:

- `commitCount`: the number of commits currently in the branch's history.
  This number grows when a new edit is made on the branch, when a branch containing new commits is merged into it, or when it is rebased onto a branch containing new commits.
  It shrinks when past commits are trimmed from the history.
- `getHeadCommit()`: returns the `TreeBranchCommitMetadata` for the branch's head commit, or `undefined` if the branch has no commits.
  Each `TreeBranchCommitMetadata` exposes the commit's `revision` string and its `parent` commit metadata, so the history can be walked backwards from the head.

A `revision` obtained this way can be passed to either of two new methods on `UntypedTreeViewAlpha` implementations:

- `revertTo(revision)`: applies a new change which reverts all changes made since `revision`.
  The generated change is subject to the same merge semantics as the reverts of individual commits, so concurrent changes sequenced before the revert which affect different parts of the document are not overwritten.
- `rewindTo(revision)`: switches the view to a new underlying branch whose head is the commit at `revision`, without applying a change.
  The original underlying branch is disposed unless it is the main branch or a shared branch, so consider `fork()`ing before rewinding if it needs to be retained.

How much history is available depends on how many commits the client retains; see the `retainHistory` option on `SharedTreeOptions`.
