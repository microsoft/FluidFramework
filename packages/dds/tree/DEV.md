# Developer Notes

## Tree

### EditManager history retention

`src/shared-tree-core/editManager.ts` owns the local policy for retaining sequenced main-branch commits.
The internal `EditManager.setMaxRetainedCommits` method accepts a nonnegative safe integer or `undefined`.
Each commit counts separately, including commits in the same sequenced batch.
Zero disables extra retention; `undefined` restores the constructor's `retainHistory` policy.
If the method is never called or the limit is cleared with `undefined`, the constructor's `retainHistory` policy applies.
When `retainHistory` is `true`, all trunk commits are retained.
When it is `false` (the default), only history required for collaboration and registered branches is retained.
A numeric limit overrides either value of `retainHistory`, including zero disabling extra retention when `retainHistory` is `true`.

Changing the limit immediately checks for history that can be trimmed.
The newest configured number of available commits are retained, but collaboration and registered branches can require older commits.
The limit is therefore not a hard memory ceiling.
Increasing the limit preserves available history and future commits; it cannot recover history already trimmed.
Unsequenced local commits do not count toward the limit.

Retained commits use the existing summary representation.
Summary generation also includes the main-trunk commits referenced by serialized peer branch bases.
The retention setting itself is not serialized or replicated and must be configured separately on each manager.
There is no SharedTree option, application API, timeline flag, settings operation, or new operation or summary format for this mechanism.
Application configuration and SharedTree integration are deferred.

Focused coverage is in `src/test/shared-tree-core/edit-manager/editManagerCorrectness.test.ts`.
