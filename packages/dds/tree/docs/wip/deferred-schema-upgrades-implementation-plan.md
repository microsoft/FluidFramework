# C2 deferred schema upgrades: implementation plan

## Status and scope

This plan implements the agreed [deferred schema upgrade design](./deferred-schema-upgrades.md).
It follows **C2: a persistent internal view branch**.
The source inspection for this plan used commit `24c481e3906` on 2026-10-26.
The publication strategy was revised on 2026-10-27 after the ordered two-commit investigation.
The implementation progress section records completed milestones and their validation.
The sequence below remains the development and removal plan; historical entries are not substitutes for current validation.

Proceed with C2 first.
Keep the application on one view checkout while a base checkout owns shared history and operation submission.
Publish application changes from view to base, and reconcile base changes into the view.
Keep this arrangement after the schema upgrade is accepted or becomes unnecessary.
Publish a still-needed schema commit before the application data commit, preserving their separate identities.
Use native data revertibles rather than combining the automatic upgrade into a data commit.
Compaction is no longer part of the selected C2 publication path.

The initial delivery must support the current rebase implementation.
Isolate the temporary workarounds so that the planned full schema/data rebase support can replace them.
Do not implement Options A, B, or C1 in parallel.

### Fixed requirements

- Add `schemaUpgradeMode: "immediate" | "deferred"`, initially with `"immediate"` as the default.
- Require an explicit `upgradeSchema()` call.
  In deferred mode, the call applies the upgrade locally without submitting an operation, or **op**.
- Expose the locally upgraded schema through existing view APIs.
  Add no public pending-upgrade state.
- Publish any still-needed upgrade with the first application-originated change that would otherwise commit.
  Do not filter by content effect.
- Keep schema and data as separate ordered commits.
  Publish neither before the application transaction succeeds.
  Correlate outcomes, but do not promise all-or-nothing acceptance across them.
  An accepted schema remains when later data fails.
- An application-requested abort discards its edits, not the previously applied local upgrade.
- A sufficient remote schema ends schema deferral.
  Use ordinary viewability against the received schema, not equality with the local target.
- Keep the view branch after deferral ends.
  Do not duplicate publication or application of edits.
- Let users undo the data change without reverting the accompanying schema upgrade.
- Retain rejected work before a lossy rebase.
  Make one safe recovery retry: at most two application attempts for the same logical operation.
  Fail-stop if reconstruction is unsafe or the retry fails.
- Support all existing editing, transaction, branching, replay, and history operations.
  Existing API restrictions remain; deferral must not introduce new restrictions.

Use the [design's scenario matrix](./deferred-schema-upgrades.md#remote-upgrade-scenario-matrix) and full validation plan as the behavioral specification.
Do not weaken these requirements to simplify an intermediate implementation.

## Implementation progress

### M8: alpha opt-in and final validation

The alpha configuration now exposes `schemaUpgradeMode: "immediate" | "deferred"`, with `"immediate"` as the default.
Configuration copies preserve it.
Shared, named, and independent roots route deferred views through the persistent controller.
Application forks remain private and use their existing merge boundary.
Replacement views can select immediate mode without abandoning an earlier submitted publication.

The public contract is documented in the configuration and upgrade APIs.
The user approved the [changeset](../../../../../.changeset/deferred-tree-schema-upgrades.md).
API reports were generated, not edited manually.
Only the two expected alpha members were added to each of `@fluidframework/tree` and `fluid-framework`.
No entrypoint regeneration was needed because no root exports changed.
This is additive, non-legacy alpha API; it requires no API Council approval.
No release-tag, export-reachability, or deprecation issues were found.
Partner integration and hosted CI were not run.

The API review used shared base `10a1b54f23b` against canonical upstream main, with the user's approval to continue despite divergence (114 upstream commits and 18 local commits at that point).
No upstream merge, push, or PR creation was performed.

Public-path tests cover explicit authorization, read-only access and export, data-only undo after recovery, view replacement, isolated forks, mode changes, independent trees, and sandbox Host/Guest synchronization.
Ten deterministic seeds each run 40 multi-client insert/remove/move/abort operations after forced schema-publication recovery, checking convergence and root identity.

#### Performance and retained-resource measurement

A bounded diagnostic compared the public immediate and deferred modes on the same two-client mock runtime.
Each of 20 measured samples followed two warm-up samples, with alternating mode order.
The workload measured opening plus upgrade, the first edit plus delivery, and 100 insert/remove transactions with delivery.
Two acknowledgement edits then advanced history trimming.
There was no arbitrary performance pass/fail threshold.

| Median time | Immediate | Deferred |
| --- | ---: | ---: |
| Opening and upgrade | 0.313 ms | 0.406 ms |
| First publication and delivery | 0.711 ms | 1.027 ms |
| Steady edit and delivery | 0.544 ms | 0.611 ms |

These are local diagnostic measurements, not production latency guarantees.
The persistent authoring branch has measurable overhead.
Both modes retained two commits and zero removed roots after acknowledgement in every measured sample.
Deferred opening sent no schema op; each complete workload sent exactly one schema op.

The first measurement exposed a base-checkout leak: anonymous merge deltas left removed roots without a retention revision.
The checkout now attributes that repair data conservatively to the newest appended commit.
The permanent detached-content regression failed with 20 retained roots before the fix and passes with zero after it.
Undo and retained-history regression suites passed after the fix.
The temporary performance diagnostic was removed.

#### Validation

- Tree production and test ESM builds: passed.
- Aggregator ESM build and both packages' `build:api-reports`: passed.
- Tree alpha export and bundle release-tag checks, plus aggregator alpha export check: passed.
- Biome and ESLint on all changed TypeScript files: passed.
- `pnpm policy-check --path packages/dds/tree`: passed.
- `pnpm --dir packages/dds/tree run test:mocha:esm --grep '^viewBranch|^deferred schema upgrade|^sharedTreeView|^SharedTree |^SchematizingSimpleTreeView|^DetachedFieldIndex|^Branches|^BranchCommitCounter|^EditManager|^TreeBranchHistoryImpl|^runtime schema upgrade API|^simple-tree configuration|^independentView|^Host and Guest correctness' --reporter dot`: 991 passed; 3 existing tests pending.
- `pnpm --dir packages/dds/tree run test:mocha:prod --grep '^viewBranch|^deferred schema upgrade|^simple-tree configuration' --reporter dot`: 130 passed.
- Retention, checkout, undo, and retained-history regression selection: 353 passed.
- Sandbox Host/Guest correctness selection including the deferred-mode test: 127 passed.
- Dependency-cruiser reported zero modules scanned; that result is not counted as validation.

M0-M8 are implemented.
M9 remains future work until full schema/data rebase support is available and passes the removal gates.

### M7b: private upgrade state and transaction scope

The controller now separates private preparation from submitted application work.
A later request is not cleared by an earlier acknowledgement or included early in its retry.
When multiple schema requirements have already triggered publication, one recovery schema op covers their latest compatible target.
The retry does not resubmit accepted work or combine application data commits.

Staged-upgrade policies remain pure and cached, as required by their existing contract.
Do not mutate a policy's captured state to test repeated upgrades.
Tests use fixed policies and legitimate view replacement instead.
Closing a view cancels its unused preparation but does not discard submitted work.
The controller keeps that work until its outcome is resolved; a replacement view can request its own pending upgrade.
No new public pending state is introduced.

Transaction frames record upgrade requests without moving them outside their transaction scope.
An abort rolls back inside requests; a committed schema-only transaction stays private.
Nested transactions and redundant upgrade calls preserve these rules.
Explicit mixed schema/data transactions retain their existing grouping and undo restrictions.
Immediate-mode behavior is unchanged.

The schema-only removal guard remains in the temporary rebase adapter.
The controller owns request lifetime, outcome correlation, metadata, cancellation, and publication.
Runtime cancellation can remove earlier queued work while retaining a later private upgrade.

Validation:

- `pnpm --dir packages/dds/tree run build:esm`: passed.
- `pnpm --dir packages/dds/tree run build:test:esm`: passed.
- Biome and ESLint passed for all five changed TypeScript files.
- `pnpm --dir packages/dds/tree run test:mocha:esm --grep '^viewBranch|^sharedTreeView|^SharedTree |^SchematizingSimpleTreeView|^DetachedFieldIndex|^Branches|^BranchCommitCounter|^EditManager|^TreeBranchHistoryImpl|^runtime schema upgrade API' --reporter dot`: 801 passed; 3 existing tests pending.
- `pnpm --dir packages/dds/tree run test:mocha:prod --grep '^viewBranch|^deferred schema upgrades: ordered publication' --reporter dot`: 93 passed.

### M7a: operation coverage and schema-change discrimination

M6 is committed as `c500499657c`.
The operation/lifecycle checkpoint is committed as `249fb0d6d16`.
The M7b state work listed below is completed in the newer progress entry above.

The current implementation covers these additional paths:

| Surface | Implemented and tested behavior |
| --- | --- |
| Independent bases | Complete local publication without waiting for service acknowledgements or emitting false settled events. |
| Application-fork merge and rebase | Project across known private schema preparation before the ordinary schema rebaser can discard fork work. Preserve unpublished data revisions and object identity. |
| Forks created before retry | Correlate by revision, not commit object identity. Map retry history into the original identifier space for rebase, then map prepared changes back. Release mappings when original revisions are trimmed. |
| Runtime cancellation | Remove cancelled data without retry, dispose its logical undo state, and retain the earlier local schema upgrade. A later user edit can publish it. |
| Ownership and failure | Preserve public shared-branch restrictions, keep application forks independent, share the authoring view's breaker with its base, and dispose the authoring view when the base is disposed. |
| Named shared branches | Route op encoding through the named branch's schema. Do not use main's schema to compress named-branch history. Summary/load tests preserve unpublished-versus-published state. |
| Editor entry points | Root replacement, object fields, arrays, maps, records, moves, and serialized application changes publish through the controller. Move recovery preserves the moved object. |
| Transactions and initialization | Empty transactions do not publish. Constraint-only and net-zero commits do publish. Nested transactions with minimization work. Initialization preserves the supplied root object. |
| Detached trees | Use their actual synchronous sequencing outcomes without waiting for a later runtime message batch. |
| Upgrade notifications | Preserve the original logical upgrade notification across private schema refreshes. |

A separate diagnostic reproduced assertion `0x8a0` in native data-only rebase, with no C2 controller or schema changes, after two different rebases of the same commit.
Do not expand this feature to repair that independent rebaser issue.
As with native merge, the fork adapter does not compute a source net change for a merge that does not need one.
The temporary diagnostic file was removed.

The staged-upgrade regression is now passing:
`keeps a requested staged upgrade enabled while receiving data-only changes`.
A staged view can already view the old schema.
The controller now distinguishes new schema commits on the base from data updates and rollback of its own schema.
Only an actual received schema change, or a base that already covers the requested target, can make that cancellation decision.

#### Remaining M7b state work

The user clarified repeated upgrade requests and transaction scope:

- Defer each upgrade request.
  Prefer one coalesced upgrade to the latest compatible target while requests are still private.
  Do not replace already-submitted ops.
- In deferred mode, a successful schema-only upgrade transaction keeps the upgrade private.
  Immediate mode remains unchanged.
- Roll back upgrades requested inside an aborted transaction.
  Keep upgrades applied before that transaction.

The current state model conflates unpublished schema preparation with an in-flight publication.
It must not lose a later requested upgrade when an earlier publication settles.
Keep later untriggered requests out of retries for earlier edits.
Coalesce already-triggered schema requirements when constructing a retry.
Do not narrow support or claim this milestone is complete while those cases remain unresolved.
The public opt-in and API reports remain M8 work.

The first M7 commit covers operation/lifecycle integration and data-versus-schema discrimination.
The next covers separate pending-upgrade and transaction-scope state.

Validation at this checkpoint:

- `pnpm --dir packages/dds/tree run build:esm`: passed.
- `pnpm --dir packages/dds/tree run build:test:esm`: passed.
- Biome and ESLint passed for the seven changed TypeScript files.
- `pnpm --dir packages/dds/tree run test:mocha:esm --grep '^viewBranch|^sharedTreeView|^SharedTree |^SchematizingSimpleTreeView|^DetachedFieldIndex|^Branches|^BranchCommitCounter|^EditManager|^TreeBranchHistoryImpl' --reporter dot`: 786 passed; 3 existing tests pending.
- `pnpm --dir packages/dds/tree run test:mocha:prod --grep '^viewBranch|^deferred schema upgrades: ordered publication' --reporter dot`: 81 passed.

### M6: native physical history and logical notifications

M5 is committed as `283d2a6acf9`.
Its object-identity, native undo/redo, and eligible undo-clone tests pass.

The user resolved the history contract in favor of native physical history.
The existing [history API](../../src/simple-tree/api/tree.ts) describes actual commits and their revision UUIDs, not logical application operations.
With history retained, a rejected data commit and its accepted retry both remain in that history, with distinct revisions and the same application metadata.
The native `revertTo` guard rejects the original revision when the later retry schema commit is between that revision and the head.
This follows the existing physical-history contract.
The M6 requirement now prohibits duplicate logical change notifications and undo handles, not distinct physical attempts in retained history.

The characterization in [viewBranch.spec.ts](../../src/test/shared-tree/viewBranch.spec.ts) proves these results.
It tests `TreeCheckout.revertTo` directly so that the existing typed-view error wrapper does not obscure the history behavior.
Additional tests preserve one logical change notification and settled outcome, transaction labels, application metadata, and replay of the serialized edit in its original context.
Accepted physical revisions work with `revertTo` and with `rewindTo` on an application fork.
M5 already supplies the native undo/redo and eligible clone transitions; M6 needs no additional production changes.

The current commit and summary formats do not store a relationship between an original revision and a retry revision.
A local-only history projection would therefore differ after loading or on another client.
Do not hide commits, redirect physical revision arguments, store internal data in application metadata, or change formats for this feature.
Keep revision-based operations tied to the commits identified by their arguments.
The application's retained undo handle instead follows the logical edit to its replacement attempt.
This decision does not affect the verified forest-preserving recovery transition.

Validation:

- `pnpm --dir packages/dds/tree run build:test:esm`: passed.
- `pnpm --dir packages/dds/tree exec biome check src/test/shared-tree/viewBranch.spec.ts`: passed.
- `pnpm --dir packages/dds/tree exec eslint --quiet src/test/shared-tree/viewBranch.spec.ts`: passed.
- `pnpm --dir packages/dds/tree run test:mocha:esm --grep '^viewBranch|^TreeBranchHistoryImpl|^custom commit metadata|^Undo and redo|^SchematizingSimpleTreeView' --reporter dot`: 199 passed; 40 existing tests pending.
- `pnpm --dir packages/dds/tree run test:mocha:prod --grep '^viewBranch' --reporter dot`: 38 passed.

### M5: coordinated recovery and retry-only identity transition

The controller correlates separate schema/data outcomes and retains dependent edits.
It waits until incoming-message bookkeeping finishes before preparing a retry.
Multi-client tests pass for recovery over remote data, data-only recovery after an equivalent remote upgrade, and fatal failure after rejection of the retry.
Application callbacks run once.

The first inserted-object regression failed.
The test inserts an object, edits it in a dependent commit, and forces rejection of the initial schema/data publication.
The retry reconstructs the data, but normal reconciliation replaces the inserted object instead of preserving the application's reference.
Keeping separate commits avoids this problem during normal publication, but recovery still needs fresh commit revisions and correct content identifiers.

A bounded experiment changed the commit revision while keeping the old atom identifiers.
It did not preserve object identity.
It also caused the alias allocator's `0xd40` assertion during a subsequent rejection.
That experiment was removed; do not treat revision-only retagging as a safe recovery path.

The approved retry-only investigation resolved this regression without compaction.
The adapter now prepares the data-only net change from the retained view state to the reconstructed state.
The checkout applies that change to the existing forest and then maps detached-content identifiers and native revertibles to the new history.
It does not apply the ordinary mixed-history net change, which would remove and rebuild the inserted objects.
The branch validates that prepared reconciliation adopts the target history without leaving source commits.
All special transformation remains in the temporary adapter; ordinary publication and ordinary rebase use their existing paths.

The regressions remain enabled in [viewBranch.spec.ts](../../src/test/shared-tree/viewBranch.spec.ts).
They cover inserted-object references, dependent edits, detached objects, undo/redo, and undo-handle clones on forks created before or after retry.
Reconstruction that violates an application constraint fails before submission.
Reconnect does not consume another application retry.
An open application transaction delays recovery, and its aborted edits are not recovered.
Detached-index tests check root preservation, retention revisions, checkpoints, and collision rejection before mutation.

M6 still covers the remaining logical history and metadata surfaces.
M7 still covers runtime cancellation, all application-fork merge/rebase paths, and the full persistence and retention-pressure matrix.
The public opt-in remains M8 work.

Validation:

- `pnpm --dir packages/dds/tree run build:esm`: passed.
- `pnpm --dir packages/dds/tree run build:test:esm`: passed.
- `pnpm --dir packages/dds/tree run test:mocha:esm --grep '^viewBranch|^sharedTreeView|^deferred schema upgrades: ordered publication|^SchematizingSimpleTreeView|^DetachedFieldIndex|^Branches|^BranchCommitCounter|^EditManager' --reporter dot`: 621 passed.
- `pnpm --dir packages/dds/tree run test:mocha:prod --grep '^viewBranch|^deferred schema upgrades: ordered publication' --reporter dot`: 51 passed.
- Biome and ESLint passed for the ten changed TypeScript files.

### Revised M4: ordered controller publication

The approved cleanup is recorded in the branch's existing commits.
The controller now publishes the first application edit as separate schema/data commits and reconciles the resulting shared history without invoking schema-only refresh on application work.
An aborted application transaction keeps the local upgrade available for the next committed edit.
Native data undo retains the schema.

Publication uses the existing ordered merge/submission path, without promising one grouped batch or all-or-nothing acceptance.
If submission fails after one member was sent, both the base and authoring checkout enter a broken state and the original error propagates.
This avoids claiming that an already submitted schema can be retracted.
Sequenced rejection and retry are M5 work; this internal entry point is not yet the supported opt-in.

Validation:

- `pnpm --dir packages/dds/tree run build:esm`: passed.
- `pnpm --dir packages/dds/tree run build:test:esm`: passed.
- `pnpm --dir packages/dds/tree run test:mocha:esm --grep '^viewBranch|^sharedTreeView|^deferred schema upgrades: ordered publication|^SchematizingSimpleTreeView' --reporter dot`: 344 passed.
- `pnpm --dir packages/dds/tree exec biome check src/shared-tree/viewBranch.ts src/test/shared-tree/viewBranch.spec.ts`: passed.
- `pnpm --dir packages/dds/tree exec eslint --quiet src/shared-tree/viewBranch.ts src/test/shared-tree/viewBranch.spec.ts`: passed.

The M0-M3 entries below record work completed under the earlier plan.
Their validation results remain historical evidence, not proof that the revised publication path is implemented.
Resume with the revised M4 sequence after the requested pause; do not commit or retain compaction solely because its experiment passed.

### M0: baseline and primitive feasibility

The original M0 branch primitive integration tests established the following.
The same [integration test file](../../src/test/shared-tree/deferredSchemaUpgrade.integration.ts) now covers the selected ordered-publication strategy.

- A private upgrade enables its view without changing base history or submitting an op.
- Ordinary merge preserves separate schema and data commits.
- Composition and revision replacement can publish an earlier schema change and a later data change as one ordered commit.
- Ordinary reconciliation of that composed history currently replaces view nodes.
  The initial identity-preservation assertion failed; a characterization test records the current limitation.
  The revised M4 avoids this normalization path by retaining separate commit identities.
- A retained branch preserves the original application change when another branch's rebase drops it.
- For the tested schema expansion and concurrent array insertion, the existing data rebaser can transform the retained application change before a fresh schema prefix is added.
- Inverting the data portion of the controlled compound commit leaves the upgraded schema intact.

These proofs establish the primitive paths, not complete retry, notification, or undo APIs.
The original experiment used one publication revision; the revised strategy preserves separate schema and data revisions and retains their history until outcomes are resolved.
Keep reconstruction limited to contexts that the adapter can prove safe.
The controller must not publish from edit-locked application callbacks or infer remote outcomes from private-branch events alone.
Keep base ownership, application-fork ownership, and private controller ownership distinct.

Validation:

- `pnpm --dir packages/dds/tree run build:esm`: passed.
- `pnpm --dir packages/dds/tree run build:test:esm`: passed.
- `pnpm --dir packages/dds/tree run test:mocha:esm --grep 'deferred schema upgrades: branch primitives' --reporter spec`: 7 passed.
- `pnpm --dir packages/dds/tree exec eslint src/test/shared-tree/deferredSchemaUpgrade.integration.ts`: passed.
- `pnpm --dir packages/dds/tree exec biome check --write src/test/shared-tree/deferredSchemaUpgrade.integration.ts`: passed after formatting.

No public deferred-upgrade option is exposed by M0.

### M1: pure schema and publication decisions

[viewBranch.ts](../../src/shared-tree/viewBranch.ts) now contains read-only decisions for received schema and publication outcomes.
The schema decision uses the actual received schema; a viewable covering schema ends deferral without requiring upgrade permission.
Publication decisions accept a definitive initial failure once, require a new retry revision, ignore stale/duplicate outcomes, and fail after a rejected retry or violated constraints.
Application cancellation and ordinary transport resubmission are explicitly outside this outcome input.
The current reducer tracks one revision.
Revise it for per-member schema/data outcomes before using it for the selected publication sequence.

[deferredSchemaRebase.ts](../../src/shared-tree/deferredSchemaRebase.ts) defines the isolated temporary adapter boundary.
It does not implement reconstruction yet.
The controller must own retained history, publication, and error handling; the adapter cannot report an unsafe transformation as an empty successful change.

Validation:

- `pnpm --dir packages/dds/tree run build:esm`: passed.
- `pnpm --dir packages/dds/tree run build:test:esm`: passed.
- `pnpm --dir packages/dds/tree run test:mocha:esm --grep '^viewBranch|deferred schema upgrades: branch primitives' --reporter dot`: 16 passed.
- `pnpm --dir packages/dds/tree exec eslint src/shared-tree/viewBranch.ts src/shared-tree/deferredSchemaRebase.ts src/test/shared-tree/viewBranch.spec.ts`: passed.
- `pnpm --dir packages/dds/tree exec biome check --write src/shared-tree/viewBranch.ts src/shared-tree/deferredSchemaRebase.ts src/test/shared-tree/viewBranch.spec.ts`: passed.

### M2: persistent synchronization foundation

The controller now publishes local branch changes and rebases received base changes without disposing the authoring checkout.
An internal completed-operation event is emitted only after edit locks and transaction-branch work have completed.
This avoids publishing or rebasing midway through transaction cleanup.
Source disposal unregisters controller listeners without disposing the base.
Explicit base synchronization forwards remote-change origin, and base sequencing forwards local commit outcomes.

The initial synchronization tests failed because the private edits and remote updates were not propagated.
They now pass, including an asynchronous transaction that receives remote data while open.
The event-forwarding regression failed independently before remote origin and settled outcomes were connected.
The public one-view reservation and deferred-mode factory wiring remain part of M3/M8; no opt-in is exposed yet.

Validation:

- `pnpm --dir packages/dds/tree run build:esm`: passed.
- `pnpm --dir packages/dds/tree run build:test:esm`: passed.
- `pnpm --dir packages/dds/tree run test:mocha:esm --grep '^viewBranch|^sharedTreeView|deferred schema upgrades: branch primitives' --reporter dot`: 264 passed.
- `pnpm --dir packages/dds/tree exec biome check --write src/shared-tree/treeCheckout.ts src/shared-tree/viewBranch.ts src/test/shared-tree/viewBranch.spec.ts`: passed.
- `pnpm --dir packages/dds/tree exec eslint src/shared-tree/treeCheckout.ts src/shared-tree/viewBranch.ts src/test/shared-tree/viewBranch.spec.ts`: passed with three existing warnings in checkout code.
- `pnpm --dir packages/dds/tree run depcruise` reported zero modules examined, so it is not treated as layering evidence.

### M3: explicit local upgrade and remote schema lifecycle

The internal controller can now create a view with an intercepted explicit upgrade.
The upgrade remains private, and the base's single-view slot is reserved until disposal.
The temporary schema-only refresh is isolated in `deferredSchemaRebase.ts` and asserts that application work has not been added.
View reconciliation suppresses intermediate schema notifications and retains a compatible context.
FlexTree node schema lookup and cached field kinds now follow the current context schema, allowing that retained context to remain correct.

The new tests first failed on premature base publication, missing remote data, and missing view reservation.
They now pass, including equivalent, insufficient, and viewable covering remote schema updates.
After a sufficient remote upgrade, subsequent application edits use the data-only path.
Ordered first publication while an upgrade is still pending remains M4 work; the public opt-in remains unexposed.

Validation:

- `pnpm --dir packages/dds/tree run build:esm`: passed.
- `pnpm --dir packages/dds/tree run build:test:esm`: passed.
- `pnpm --dir packages/dds/tree run test:mocha:esm --grep '^viewBranch|^sharedTreeView|^SchematizingSimpleTreeView|^LazyNode|^LazyField|^simple-tree proxies|^SharedTreeObject|^ArrayNode Proxy|deferred schema upgrades: branch primitives' --reporter dot`: 468 passed, 2 existing pending tests.
- Focused Biome checks on the eight changed TypeScript files passed.
- Focused ESLint checks found one new condition-style error, which was fixed; existing checkout and FlexTree warnings were left unchanged.

### Superseded M4 experiment: compaction primitive

This section records the uncommitted single-commit experiment and its validation.
The user selected ordered two-commit publication on 2026-10-27.
The compaction primitive is not a dependency of the revised M4 or native data-only undo.
The subsequent ordered-publication cleanup removed its code and compaction-only tests.
The description and results here are historical evidence, not APIs that remain in the working tree.

The inserted-object regression exposed a distinct identity problem:

- Publishing a composed change under a fresh revision while retaining its original change-atom revisions fails the current codec assertion: a tagged change must contain only the tagged revision.
- Normalizing those revisions makes the publication encodable, but ordinary source-branch rebase removes and recreates the inserted node.
  Suppressing intermediate schema notifications does not prevent this data-level identity replacement.

The regression now passes through an explicit compaction operation before publication.
The live forest, schema, anchors, and inserted object remain in place.
No new wire format is used.

The superseded review changes were:

- [DetachedFieldIndex.replaceRevisions](../../src/core/tree/detachedFieldIndex.ts) remaps detached-node identifiers and retention revisions with the same mapping used by the normalized change.
  Forest root locations and allocation remain unchanged.
  A collision fails before the index is modified.
- [SharedTreeBranch.compact](../../src/shared-tree-core/branch.ts) composes a nonempty private suffix under a fresh revision and emits a history-only rebase event containing the revision mapping.
  Existing branch counters and ancestry tracking receive the history replacement.
  Original commits and other forks are not rewritten.
- [TreeCheckout.compactUnpublishedHistory](../../src/shared-tree/treeCheckout.ts) checks ownership and operation boundaries, pins the original history, and coordinates repair-data remapping.
  Its result exposes the original commits and revision mapping and provides a disposal method for the retained history.
  Original local change-event emitters are associated with the compacted commit's eventual settlement.
- [ModularChangeFamily.changeRevision](../../src/feature-libraries/modular-schema/modularChangeFamily.ts) now raises the changeset's `maxId` when normalization allocates larger local identifiers.
  A new regression first failed with an identifier above the recorded bound.
  The fix preserves existing revision-only retagging behavior.

This is a low-level internal primitive, not complete C2 publication integration.
The caller must ensure the suffix is unpublished and must coordinate external references before releasing the retained history.
The primitive rejects active suffix revertibles rather than invalidate their commit contexts.
The active-revertible guard and cross-history translation were costs of this experiment, not requirements to carry into the two-commit path.
The revised path must preserve native data revertibles and existing application-fork identity.
Retry can still require explicit mappings when rejected work receives new revisions.
These historical tests exercise a data-only inverse directly; the later two-commit probes also exercised a native revertible.

Coverage includes the original inserted-node failure, successive edits after publication, repeated compaction, inserts/moves/removals, restoration of an earlier root, repair-data cleanup, retained forks, history counts, metadata, settled outcomes, and invalid compaction boundaries.

Validation:

- `pnpm --dir packages/dds/tree run build:esm`: passed.
- `pnpm --dir packages/dds/tree run build:test:esm`: passed.
- `pnpm --dir packages/dds/tree run test:mocha:esm --grep '^DetachedFieldIndex|^Branches|^BranchCommitCounter|^EditManager|^SquashingTransactionStack|^TransactionStack|^sharedTreeView|^viewBranch|deferred schema upgrades: branch primitives|^SharedTreeChangeFamily|^sharedTreeChangeCodec|^SharedTreeCore|^DefaultResubmitMachine|^Summary load regression tests|^ModularChangeFamily|^DefaultRevisionReplacer' --reporter dot`: 765 passed.
- `pnpm --dir packages/dds/tree run test:mocha:prod --grep '^DetachedFieldIndex methods replaceRevisions|^Branches compact|deferred schema upgrades: branch primitives|^SharedTreeChangeFamily changeRevision' --reporter dot`: 29 passed.
- Focused Biome and ESLint checks passed; existing unrelated lint warnings were left unchanged.

The compaction experiment was not committed.
The remaining ordered-publication cleanup changes are paused for review before controller integration, further milestones, or a commit.
M4 as a whole is not yet complete.

#### Review follow-up: separate identifier-bound fix

The `maxId` regression also fails on upstream `main` at `35d5837a65e`, independently of C2.
The fix, regression, explanatory comments, and changeset are isolated in local branch `fix/tree-change-revision-max-id`, commit `2e9936d1688`.
That branch contains no C2 commits and is available in the separate `/workspaces/FluidFramework-maxid-fix` worktree.
Its focused validation passed: 129 normalization/rebase tests, 3 production-style tests, compilation, formatting, lint, package policy, dependency consistency, and version checks.
The user will push the branch; automated push attempts could not authenticate.
The matching fix remains in this working tree independently of the removed compaction experiment.

Compaction was not a workaround for schema rebase alone.
It supported the superseded choice to normalize separately authored edits into one publication commit.
The selected two-commit strategy removes that need by preserving their identities; it does not depend on future rebase work making ordinary merge squash them.
Additional inline comments explain this history/content distinction, repair-data remapping, retention, settlement forwarding, and the associated tests.

### Ordered-publication cleanup: complete, awaiting review

The cleanup removes the uncommitted compaction APIs, event mapping, repair-data remapping, settlement fan-out, and compaction-only tests.
The branch, checkout, detached-field index, and their dedicated test files now match their pre-compaction state.
Committed M1-M3 C2 synchronization, schema reconciliation, and temporary refresh code are unchanged.
The independent `maxId` fix and its regression remain.

[The ordered-publication integration suite](../../src/test/shared-tree/deferredSchemaUpgrade.integration.ts) now provides 16 permanent tests for the selected primitive behavior:

- A private schema upgrade survives an aborted application transaction without publication.
- Ordinary merge publishes the original schema and data revisions in order, preserves an inserted object, and does not republish earlier commits.
- Native data undo and redo retain the schema and restore the original node.
- Separate-message and turn-based delivery preserve independent outcomes and order.
- The current rebaser drops data following a rejected schema, including data valid under the old schema or an equivalent winning remote schema.
- Reconnect preserves order and does not revive dropped data.
- Runtime rollback removes queued data before schema.
- An accepted schema remains when later data is rolled back or violates a constraint.

The tests use the existing three-client mock runtime, optimized forest, and branch APIs.
They do not claim that C2's per-member retry tracking or publication controller is complete.
No outcome reducer or controller behavior was changed in this cleanup.

Validation:

- `pnpm --dir packages/dds/tree run build:esm`: passed.
- `pnpm --dir packages/dds/tree run build:test:esm`: passed.
- `pnpm --dir packages/dds/tree run test:mocha:esm --grep '^DetachedFieldIndex|^Branches|^BranchCommitCounter|^EditManager|^SquashingTransactionStack|^TransactionStack|^sharedTreeView|^viewBranch|^deferred schema upgrades: ordered publication|^SharedTreeChangeFamily|^sharedTreeChangeCodec|^SharedTreeCore|^DefaultResubmitMachine|^Summary load regression tests|^ModularChangeFamily|^DefaultRevisionReplacer' --reporter dot`: 755 passed.
- `pnpm --dir packages/dds/tree run test:mocha:prod --grep '^deferred schema upgrades: ordered publication|^SharedTreeChangeFamily changeRevision' --reporter dot`: 19 passed.
- `pnpm --dir packages/dds/tree exec biome check src/feature-libraries/modular-schema/modularChangeFamily.ts src/test/shared-tree/deferredSchemaUpgrade.integration.ts src/test/shared-tree/sharedTreeChangeFamily.spec.ts`: passed.
- `pnpm --dir packages/dds/tree exec eslint --quiet src/feature-libraries/modular-schema/modularChangeFamily.ts src/test/shared-tree/deferredSchemaUpgrade.integration.ts src/test/shared-tree/sharedTreeChangeFamily.spec.ts`: passed.

Stop here for review.
No cleanup commit has been created, and the remaining M4 publication and M5 outcome/retry work has not started.

### Investigation: ordered two-commit publication

The 2026-10-27 investigation established the ordered two-commit alternative, which the user selected.
The milestone sequence below now follows that strategy.
The probes establish behavior of the underlying primitives, not a completed controller implementation.

#### Ordering and rejection are separate guarantees

- The loader's [connection manager](../../../../loader/container-loader/src/connectionManager.ts) assigns increasing client sequence numbers.
  Its [delta manager](../../../../loader/container-loader/src/deltaManager.ts) delivers sequenced messages in order and checks client sequence consistency.
- The Routerlicious sequencer's [order check](../../../../../server/routerlicious/packages/lambdas/src/deli/lambda.ts) ignores duplicates and rejects gaps.
  This prevents a later op from silently skipping a missing earlier op from the same client.
- [Grouped batches](../../../../runtime/runtime-definitions/src/protocol.ts) additionally keep their messages contiguous and free from other clients' interleaving.
  Same-client ordering alone does not promise identical batch boundaries or one shared commit outcome.
- The runtime's [pending-state replay](../../../../runtime/container-runtime/src/pendingStateManager.ts) preserves queued order and batch grouping on reconnect.
  Transport resubmission is distinct from a new application recovery attempt.
- A service NACK is not a SharedTree schema conflict.
  The connection manager reconnects or closes the container; the rebaser, not the ordering service, decides whether a schema change has an effect.

#### Current schema-rejection cascade

With private history `B -> S -> D1 -> D2` and a concurrent remote change `R`, the current [branch rebase algorithm](../../src/core/rebase/utils.ts) rebases each later change over the rollback of its predecessors as well as the new base.
If `S` loses, reconciling `D1` includes the inverse of `S`.
The current [SharedTree change family](../../src/shared-tree/sharedTreeChangeFamily.ts) returns an empty change whenever either nonempty input contains a schema change.
That causes both `D1` and `D2` to be dropped as well.

This happens even if the data edit is valid under the old schema, or if an equivalent remote schema upgrade has already made it valid.
The resulting `FullyDropped` outcomes are per commit.
The original changes must still be retained for the one-retry policy.
This conservative cascade is current implementation behavior, not a permanent grouping guarantee that can be assumed after full schema/data rebase support lands.

Runtime rollback uses a different path.
The runtime's [batch checkpoint](../../../../runtime/container-runtime/src/opLifecycle/batchManager.ts) visits queued changes in reverse order.
[SharedTreeCore.rollback](../../src/shared-tree-core/sharedTreeCore.ts) only rolls back the latest commit and asserts if asked to roll back an earlier one.
Thus, rolling back an unflushed schema/data batch removes data before schema.
The schema rollback method does not independently search for and cancel arbitrary later commits.

#### Probe results

Sixteen temporary deterministic probes used three clients, the optimized forest, and real SharedTree changes.
All passed after correcting the no-change-constraint fixture's minimum client version.
The first five scenarios below each ran with separate-message and turn-based bunched delivery.
The remaining six each ran once.
The probes were removed after the investigation.

| Scenario | Observed result |
| --- | --- |
| Ordered schema then data, no conflict | Both commits applied in order. A native data revertible undid data without reverting schema. |
| Concurrent data edit sequenced before schema | Schema and both following local data commits became empty and reported `FullyDropped`; all clients converged on the old schema. |
| Equivalent remote schema wins | The local schema and following data were still dropped, although the local view was compatible afterward. |
| Reconnect with no conflict | Both original commits applied in order. |
| Reconnect over conflicting remote data | Schema and dependent commits remained dropped after resubmission. |
| Merge private schema/data history without compaction | Publication and later synchronization preserved an inserted object's identity; another edit through that object reached peers. |
| Roll back unflushed schema/data/data | Rollback order was data, data, schema; no data op remained queued. |
| Accepted local prefix before failed upgrade | The prefix remained; edits after the failed schema were dropped. |
| Process the schema message before the separate data message | A peer could observe the upgraded schema before the content edit arrived. |
| Accepted schema followed by rollback of unflushed data | Schema remained upgraded; data was removed. |
| Accepted schema followed by a constrained data edit | Schema remained applied while the data reported `NewContentOnly` and did not enter document content. |

The last two cases show that two commits are not an all-or-nothing publication transaction.
Ordering and a current forward rejection cascade do not undo an already accepted schema when later data fails.
For application-requested abort, C2 must keep both changes private until the application transaction completes.

Additional existing-suite validation passed:

- Loader client sequence-number validation: 3 tests.
- Runtime batching, `orderSequentially`, pending replay, and rollback: 63 tests.
- SharedTree schema-conflict and runtime rollback tests: 16 tests.

These were local unit/integration checks with mock delivery plus production-source tracing.
No live Fluid service or deployed driver was tested.

#### Implications for the design

An ordered schema commit followed by a data commit is the selected C2 strategy.
It preserves original edit revisions and avoids initial-publication normalization and special data-only undo projection from a mixed commit.
It still needs:

- Submission only after the application transaction succeeds, with explicit handling of failure between the two submissions.
- A real runtime batch if non-interleaving or batch rollback is part of the intended contract; do not assume it merely from two adjacent method calls.
- Correlation of separate schema/data outcomes and retained work for one coordinated retry.
- Care when schema succeeds but data fails, and when a sufficient remote schema removes the need for a schema retry.
- An explicit contract and tests for what happens to dependent data when future schema rebase rules change.

Single-commit publication is an implementation strategy, not a separately agreed user-facing requirement.
The investigation does not justify discarding user changes or relaxing the retry-or-fail-stop contract.
Implementation remains paused; this update changes the plan only.

## 1. Development method

### Documentation-driven and test-driven increments

For each behavior:

1. Write its contract before its implementation.
   State the inputs, output, state transition, ownership, notification timing, and failure behavior.
   Put declaration contracts in TypeScript documentation comments.
   Keep temporary limitations and design rationale in internal documentation.
2. Write the smallest test that demonstrates the contract.
   Run it and confirm that it fails for the intended missing behavior.
   Fix setup or compilation errors before treating a failure as evidence.
3. Implement the smallest complete change that makes the test pass.
4. Refactor with the test passing.
   Keep decision logic separate from mutation and external effects.
5. Run the directly affected regression tests and type checks.
   Review the documentation against the tested behavior.
6. Record the exact validation command and result in the change description.

Repeat this cycle within each milestone below.
Do not create a large disabled test suite and then implement the entire feature at once.
Do not merge skipped or permanently failing feature tests.
Keep each integrated increment passing.

### Commit each validated milestone

Treat each completed milestone as a commit checkpoint on the implementation branch.
After its changes pass the required validation:

1. Update this plan and the design proposal where the implemented approach, progress, or remaining work has changed.
   Record validation evidence and explain any necessary deviations.
2. Stage only the code, tests, generated artifacts, and documentation that belong to the milestone.
   Include necessary plan updates in the same commit, not in a deferred documentation cleanup.
   Leave unrelated working-tree and staged changes untouched.
3. Create a commit using Conventional Commits syntax: `type(scope): summary`.
   Choose the type that describes the change, such as `feat`, `fix`, `refactor`, `test`, or `docs`.
4. Include a commit-message body describing what changed, why it changed, the milestone, and the exact validation commands and results.
   Include the repository-required co-author trailer.
5. Confirm that the commit contains the intended milestone changes before proceeding to the next stage.

For example, a completed synchronization stage could use the title `feat(tree): add persistent view branch synchronization`, followed by a descriptive body and validation evidence.
Do not commit the intentionally failing test phase as a completed milestone.
If validation is blocked or fails, resolve or report the blocker rather than claim the stage is complete.
Do not wait until the end of the implementation to commit all milestones together.
M9 has its own checkpoint only when the future workaround-removal work is actually completed and validated.

Draft the opt-in API contract early, but do not expose an incomplete public feature.
Use internal entry points for the initial development increments.
Add the supported opt-in only after publication, recovery, undo, and all operation paths meet their release gates.
Keep unimplemented behavior clearly marked as a proposal until that point.

### Required guidelines

Follow the repository's [Coding Guidelines](../../../../../docs/content/Guidelines/Coding-Guidelines.md) and [Documentation Guidelines](../../../../../docs/content/Guidelines/Documentation-Guidelines.md).
The supplied snapshots match these repository documents.
In particular:

- Use simple types, clear names, and the existing module boundaries.
  Do not introduce a general state-machine framework, functional-programming package, or event bus.
- Use `readonly` data and discriminated unions where they clarify valid states.
  Avoid unchecked casts, non-null assertions, and unnecessary generic parameters.
- Validate supported API misuse with the appropriate error.
  Use `UsageError` where the existing API contract requires it.
- Use assertions for implementation invariants, not supported user input.
  Give new assertions descriptive string literals; do not invent assertion codes.
- Preserve existing event conventions and registration order.
  Compose with the shared event helpers rather than expose an emitter to applications.
- Keep comments short and explain non-obvious intent.
  Use TSDoc for declarations, including internal contracts.
- Write documentation in Simplified Technical English.
  Follow [TypeScript documentation guidance](../../../../../docs/content/Guidelines/Documentation-Guidelines/Documenting-TypeScript.md), [TSDoc guidance](../../../../../docs/content/Guidelines/Documentation-Guidelines/Documenting-TypeScript/TSDoc-Guidelines.md), and [Fluid terminology](../../../../../docs/content/Guidelines/Documentation-Guidelines/Fluid-Terminology.md).
- Document deliberate API errors and recoverability accurately.
  Do not describe assertion failures as expected API behavior.
  Let the owning runtime boundary classify fatal processing errors.
- Do not hand-edit API reports or introduce dependencies for this feature.

## 2. Intended implementation structure

### Reuse existing code before adding abstractions

| Existing area | Use in this implementation |
| --- | --- |
| [SchematizingSimpleTreeView](../../src/shared-tree/schematizingTreeView.ts) and [configuration](../../src/simple-tree/api/configuration.ts) | Explicit upgrade entry point, local compatibility, view lifetime, and the opt-in. |
| [TreeCheckout](../../src/shared-tree/treeCheckout.ts) | Checkouts, transactions, edit locks, change application, revertibles, and outcome events. |
| [SharedTreeBranch](../../src/shared-tree-core/branch.ts) and [transaction stack](../../src/shared-tree-core/transaction.ts) | Existing branch and composition machinery; do not duplicate branch algorithms. |
| [SharedTreeChangeFamily](../../src/shared-tree/sharedTreeChangeFamily.ts) and [change codecs](../../src/shared-tree/sharedTreeChangeCodecs.ts) | Ordered schema/data composition, inverses, revision replacement, and encoding. |
| [SharedTreeKernel](../../src/shared-tree/sharedTree.ts) and [SharedTreeCore](../../src/shared-tree-core/sharedTreeCore.ts) | Submission, received changes, sequencing, shared branches, and runtime failure boundaries. |
| [EditManager](../../src/shared-tree-core/editManager.ts) and [resubmit machine](../../src/shared-tree-core/defaultResubmitMachine.ts) | History retention and transport resubmission; distinguish these from a new recovery attempt. |
| [History](../../src/shared-tree/history.ts), [revertible contracts](../../src/core/revertible.ts), and [independent views](../../src/shared-tree/independentView.ts) | Preserve existing history, undo, and non-runtime behavior. |
| [Host synchronization](../../src/sandboxing/hostSynchronization.ts) and [guest synchronization](../../src/sandboxing/guestSynchronization.ts) | Prior art for persistent branches, exact retained heads, ordered acknowledgements, and cleanup. |
| [Breakable](../../src/util/breakable.ts) | Fatal state propagation; verify the host also receives the failure. |

Sandbox synchronization is prior art, not a component to import wholesale.
Its transport protocol, identifier shards, and stopped-state behavior are not the C2 contract.
Do not introduce a dependency from lower tree layers back into sandboxing.
Extract a small shared helper only if both users need the same contract and a valid layer can own it.

### Keep the new code small

Start with two internal implementation units under [shared-tree](../../src/shared-tree):

1. A permanent view-branch controller, provisionally named `viewBranch.ts`.
   It owns synchronization and small pure decision helpers.
2. A temporary rebase adapter, provisionally named `deferredSchemaRebase.ts`.
   It owns the workaround-specific reconciliation and reconstruction.

The first implementation increments introduced these internal modules; they are not new public APIs.
Add matching unit tests under [test/shared-tree](../../src/test/shared-tree).
Extract further files only when a cohesive responsibility or a demonstrated reuse case warrants it.
Keep schema/data composition helpers beside the existing change-family code when that is their natural owner.

The permanent controller must own:

- The borrowed base checkout and the owned view checkout.
- Internal schema-deferral state, separately from publication attempts and transaction state.
- Logical-edit records that link private changes, published revisions, retry revisions, and outcomes.
- An ordered list of publication members, identifying the schema commit and application commits, with each member's submission and settled state.
  One logical attempt owns the retry allowance even though several commits can report outcomes.
- Event subscriptions, retained history, and disposal.
- Origin tracking that distinguishes application changes from synchronization and preparation.

Do not put internal tracking in user custom metadata or persisted node content.
Do not add a persisted format field merely to make local bookkeeping convenient.
If history or replay requires durable identification, resolve that need explicitly before selecting a format change.

### Functional programming where practical

Use pure functions for decisions that do not need to mutate a checkout:

- Decide whether a received schema ends deferral.
- Select the pending schema target from explicit schema and policy inputs.
- Classify a known event origin and outcome.
- Decide whether an initial failure permits the single retry.
- Plan which application changes belong in one publication.

Return explicit results such as a publication plan, no action, or a terminal failure reason.
Do not use `undefined` to represent both a successful no-op and failed recovery.
Keep inputs and returned plans read-only.
Pass clocks, revision allocation, and mutable services at the effect boundary instead of hiding them in decision helpers.

Use a small controller to execute the selected work: fork, compose, apply, submit, notify, and dispose.
Use exhaustive switches rather than a growing set of loosely related flags.
Do not build a generic command interpreter when direct typed calls suffice.

Mutation remains appropriate in the existing forests, branch graphs, caches, and controller-owned maps.
Do not deep-copy the forest for functional purity.
A `readonly` reference to a commit does not protect it from history trimming; use supported branch retention to pin the required state.

## 3. Contracts to settle in code before broad implementation

These are technical contracts within the agreed behavior, not requests to reduce scope.
Write each contract and its first tests in milestone M0.

| Contract | Required decision and evidence |
| --- | --- |
| Creation and ownership | Determine where deferred-mode views obtain their persistent checkout. Preserve the one-view restriction on the base, even if the public view uses a different anchor set. Define ownership for shared, independent, and application-forked views. |
| Synchronization boundary | Identify a safe internal point for publication and base-to-view updates. Prove that locks and event ordering remain correct without a microtask that changes submission timing. |
| Commit identity | Preserve the earlier private schema commit and later application commits during normal publication. Track their order and published membership without compaction. Map new identities only when recovery requires a new attempt. |
| Submission boundary | Submit only after application commit. Identify a supported runtime batch/rollback boundary where needed, and test failure between submitting schema and data. Do not assume joint acceptance. |
| Local and remote event identity | A private checkout is not a shared branch. Its current event logic cannot simply be assumed to provide the same remote-change and settled events as the base. Define forwarding without duplicate logical notifications. |
| Retained work | Retain original changes, their base, constraints, detached content, and dependent edits before a lossy rebase. Define who owns each retained reference and when it is released. |
| Retry safety | Prove a safe reconstruction path using each member's actual outcome. Do not replay accepted schema or data, retry on an unknown acknowledgement, or reset the logical attempt's allowance. |
| Native data undo | Preserve the separate data commit's revertible, cloning, disposal, and history identity. Translate only where recovery changes the data revision; do not add mixed-commit undo projection for the automatic upgrade. |
| Fatal propagation | A private fork has its own breaker. Prove that a fatal synchronization failure stops the affected public tree/view and reaches the runtime or independent-view caller. Logging alone is insufficient. |

Use small executable proofs for ordered publication, partial outcomes, retry, and native data undo.
Keep the useful tests as regression coverage.
If a proof cannot satisfy its contract, revise the implementation design before exposing the opt-in.
Do not hide an unresolved mechanism behind a success result or a general "pending upgrade" error.

## 4. Dependency-ordered implementation milestones

Each milestone follows the documentation, failing test, implementation, and refactoring cycle in Section 1.
The dependency table gives prerequisites, not instructions to combine milestones into a large change.
Complete validation and create the milestone's Conventional Commit, including necessary plan documentation updates, before starting the next stage.

| Milestone | Prerequisites | Deliverable |
| --- | --- | --- |
| M0 | None | Contract map, baseline tests, and executable feasibility proofs. |
| M1 | M0 | Pure decisions and isolated rebase-adapter contract. |
| M2 | M1 | Persistent synchronization for already-compatible schemas. |
| M3 | M2 | Explicit local upgrade, read-only behavior, and remote-schema handling. |
| M4 | M3 | Ordered schema/data publication, submission failure handling, and transaction integration. |
| M5 | M4 | One safe retry and end-to-end fatal failure. |
| M6 | M5 | Native data revertibles, retry identity, and correct logical history. |
| M7 | M6 | Complete public-operation and persistence coverage. |
| M8 | M7 | Public opt-in, final documentation, and release validation. |
| M9 | M8 and deployed full rebase support | Removal of temporary workarounds. |

### M0. Record contracts and establish baseline behavior

**Documentation first**

- Record the ownership, identity, synchronization, retry, and undo contracts above.
- Draft API documentation for the mode, `upgradeSchema`, compatibility queries, transactions, and errors.
- Record the current schema-rebase limitation and its planned replacement.
  Do not describe future rebase support as already available.

**Tests first**

- Confirm immediate mode remains the baseline.
- Convert relevant prior branch probes into concise permanent tests where coverage is missing.
- Prove that a local fork upgrade sends no op, ordinary merge publishes separate commits in order, and initial publication preserves inserted-node identity without compaction.
- Convert the relevant two-commit investigation probes into permanent tests.
  Include native undo, rejection cascade, reconnect, reverse-order batch rollback, and schema-accepted/data-failed outcomes.
- Write focused tests that demonstrate the identity, retry, and undo gaps before adding new coordination.

**Implementation and gate**

Reuse [TestTreeProviderLite](../../src/test/utils.ts), the existing mock runtime, and existing schema assertions.
Add only missing test observations, such as a clear record of submitted tree commits.
Do not create a second runtime simulation.
The gate is a documented, test-backed implementation path for the three high-risk mechanisms, not only a happy-path demonstration.

### M1. Add pure decisions and one temporary-adapter boundary

**Documentation first**

Specify the private state transitions, origin categories, and adapter inputs and results.
Keep schema-deferral state separate from "initial attempt in flight", "retry in flight", accepted, failed, and disposed states.
Ending schema deferral must not erase a retry count or outstanding outcome tracking.
Record schema and application outcomes per member; schema acceptance alone does not accept the whole logical publication.

**Tests first**

- Equivalent or covering remote schema ends deferral; an insufficient schema does not.
- Internal schema work, remote updates, rollback, and transport resubmission do not initiate publication.
- Initial confirmed rejection permits one retry; a failed retry is terminal.
- A new revision, remote schema, or dependent edit does not reset the allowance.
- Application-requested abort does not retry.
- Duplicate or stale notifications cannot advance the same logical operation twice.
- A failed schema acknowledgement does not by itself prove every later member's final outcome.
- Accepted members are excluded from recovery, and an unknown member outcome prevents unsafe duplicate replay.

**Implementation and gate**

Implement small deterministic helpers and the narrow adapter contract.
A pure test must assert the next decision and any retained state, not call a live runtime.
Use explicit input snapshots; do not mutate them.
The permanent controller must not inspect which temporary workaround produced a valid reconciliation result.

### M2. Synchronize a persistent view branch without a schema difference

**Documentation first**

Specify base-to-view and view-to-base ordering, listener lifetime, commit outcomes, and transaction boundaries.
Explain which checkout is owned and which is borrowed.

**Tests first**

- A local edit reaches the base once and is not echoed back as another application edit.
- A remote edit reaches the view once while cached nodes remain valid.
- Acknowledgement and reconnect do not duplicate publication or notifications.
- Multiple local edits and remote updates preserve order.
- Nested and asynchronous transactions do not publish partial work or bypass edit locks.
- A second view cannot bypass the existing one-view restriction through a new private checkout.
- Disposal releases private listeners and history without disposing a shared base.

**Implementation and gate**

Build the permanent controller using existing branch operations at a safe internal boundary.
Do not use an unrestricted `changed`-listener merge loop.
Preserve normal synchronous submission behavior outside transactions.
Acknowledge sequencing on the base and forward the corresponding logical outcome to the view.
The gate is repeated bidirectional synchronization with no schema-specific code.

### M3. Apply the upgrade locally and handle incoming schema changes

**Documentation first**

Specify that configuration does not itself upgrade the tree.
After the explicit upgrade call, all view-facing compatibility and staged-upgrade queries describe the local upgraded schema.
Describe the temporary schema-only refresh internally.

**Tests first**

- Explicit local upgrade permits reading and sends no op.
- Reading, observing, exporting, and disposing do not change the base schema or summary.
- Repeated upgrade calls do not add private schema work or force publication.
- Remote version 2 for a local version 2 view ends deferral.
- Remote version 2 for a local version 3 view keeps the local upgrade pending.
- Remote version 3 that is compatible with a local version 2 view ends deferral without requiring equivalence.
- An incompatible expansion is not mistaken for a sufficient schema.
- Remote data updates keep a read-only upgraded view current without disposing unaffected nodes.
- Ending deferral keeps C2 alive but removes obsolete upgrade preparation.

**Implementation and gate**

Apply the real upgrade on the private checkout and use its schema for normal validation and chunk preparation.
Keep shared snapshots and summaries on the base.
Use the temporary adapter for schema-only refresh until standard rebase supports it.
Avoid exposing intermediate downgrade/re-upgrade states to callbacks.
Keep identifiers, anchors, and object identity stable; do not reconstruct the tree from exported JSON.
The gate includes optimized and debug forests, not only the reference forest.

### M4. Publish ordered commits and preserve transaction semantics

**Documentation first**

Specify the publication boundary, preserved schema/data identities, and lifecycle of the private schema commit.
Document the distinction between local application, submission, and accepted outcome.
Specify the event trace for a single edit and an enclosing transaction.
Document that an accepted schema can remain after later data failure.
Identify the exact runtime boundary used for non-interleaving or rollback if the implementation relies on those guarantees.

**Tests first**

- The first generated application change publishes a schema commit followed by a separate data commit.
- The initial pair retains its revisions and inserted-node identity without compaction.
- Edits already valid under the old schema still trigger publication.
- Constraint-only and net-zero committed changes count; calls that generate no change do not.
- An application-requested inner or outer abort sends neither schema nor data and leaves the local upgraded view usable.
- An earlier successful inner edit is not erased by aborting a later inner transaction.
- A later edit after abort publishes the still-needed upgrade without another upgrade call.
- A sufficient remote schema arriving during a transaction cancels the unpublished schema commit without losing application work.
- Post-processors preserve the agreed trigger and constraint semantics.
- The second and later edits never republish the original private schema or data.
- Separate-message and grouped-batch delivery both preserve schema-before-data order.
- A failure between submissions rolls back the complete queued scope where supported, or causes explicit fatal failure; it never reports success after losing work.
- Reverse-order runtime rollback removes data before schema when both are queued.
- An already accepted schema remains when later data is rolled back or rejected.

**Implementation and gate**

The targeted compaction cleanup and ordered-publication primitive tests are complete and awaiting review, as recorded above.
Keep the independent `maxId` fix and regression separate from C2's publication design.
Do not reintroduce compaction APIs merely to preserve the superseded approach.

Retain the original work before publishing.
Use the existing branch merge path to publish a committed suffix in schema-then-data order without normalizing it into one revision.
Application transactions still use the existing stack for their own data changes.
Do not leave a transaction open across the read-only period to capture the earlier schema commit.
Preserve labels, custom metadata, and the original transaction grouping.
Exercise normal encoding, enrichment, and submission.
Add only the runtime-boundary wiring needed for ordered publication and defined failure handling.
Do not fabricate batching guarantees inside the tree or bypass runtime pending-state tracking.

Record schema and application commits as members of one logical publication attempt.
Preserve multiple application commits when an existing operation transfers a longer history.
Do not implement this as exactly two ops for every possible API path.

The gate requires assertions on actual submitted commit identities and order, transaction-abort behavior, partial submission, the view/base history relationship, and a subsequent edit.
A runtime batch does not turn separate SharedTree outcomes into one atomic acceptance result.
A matching final JSON tree alone is not sufficient.

### M5. Retry once safely, then fail-stop

**Documentation first**

Document the safety preconditions for each reconstruction path and the one-retry policy.
Specify the fatal boundary for synchronous, asynchronous, shared, and independent cases.
Document why transport resubmission is not a new application attempt.

**Tests first**

- Initial rejection followed by acceptance produces exactly two application attempts and one logical application of user work.
- Retry rejection or synchronization rollback causes fatal failure with no third attempt.
- Unsafe reconstruction fails before an unsafe retry is submitted.
- Application cancellation does not trigger retry.
- Delayed acknowledgement does not trigger an extra attempt.
- Remote schema changes and dependent local edits do not reset the retry allowance.
- A sufficient remote schema leads to data-only recovery without the cancelled upgrade.
- Schema rejection currently drops following data, including edits valid under the old schema; retain and correlate all affected outcomes.
- Schema acceptance followed by data rejection preserves the schema and retries only failed work when safe.
- No retry starts while relevant member outcomes or runtime bookkeeping remain unresolved.
- Retained work survives history trimming and detached-content cleanup pressure.
- Application callbacks with external side effects run only once.
- A fatal error reaches the host and prevents later access through the affected view/tree.

**Implementation and gate**

Use the adapter to prepare a valid new attempt against current state, not to rerun application callbacks.
Preserve application constraints and stable target identity.
Do not simply replay old indexes, strip all schema changes, or feed the same mixed change into the rebaser that dropped it.

Start with a proof for monotonic local expansion over remote data edits.
Retain the schema and data commits separately and transform application changes only where their contexts and identifiers can be reconciled safely.
Use existing data rebase machinery for proven compatible contexts.
For remote schema changes or mixed histories, check schema compatibility and data interpretation explicitly before taking that path.
If the checks cannot prove a safe reconstruction, return a terminal failure result rather than an empty success.
The plan does not assume this transformation is already provided by the codebase.

Retain dependent edits until the publication outcome is resolved.
Route one new ordered attempt through normal submission, with its member revisions linked to the original logical operation.
Omit accepted or remotely satisfied schema work and any already accepted application member.
Do not replay the full pair solely because one member failed.
Keep the retry count independent of pending-schema state.

The gate is real multi-client rejection and recovery, plus the fatal path.
Injecting an outcome is useful for unit tests but is not sufficient integration evidence.
Do not clear a broken-state marker to keep a failed scenario running.

### M6. Preserve native data undo and stable history

**Documentation first**

Specify that user undo retains the schema, while an application abort cancels the transaction's publication.
Define how revertibles refer to the logical edit before and after a retry.
Document history and serialization behavior without exposing internal attempt bookkeeping.

**Tests first**

- Undo of the first data edit retains the upgraded schema on all clients.
- Redo restores the data without another schema upgrade.
- Undo works after intervening data edits, a successful retry, and remote-schema cancellation of deferral.
- A revertible can be cloned to an eligible application fork and disposed normally.
- History traversal preserves physical attempts and their actual revision IDs.
  The original rejected commit and the accepted retry may both carry the same application metadata.
- Logical change notifications, labels, undo handles, and settled outcomes are not duplicated by internal recovery.
- Supported `revertTo` and `rewindTo` operations preserve their documented semantics.
- Schema-only edits and arbitrary mixed-schema operations retain their existing restrictions where those are already part of the API.

**Implementation and gate**

Use the separate data commit's existing revertible and retain its repair data.
Do not remove `hasSchemaChange` guards or introduce special inverse projection for the automatic upgrade.
Forward data outcomes and preserve or translate the revertible's identity if a successful retry replaces the data revision.
Do not apply a data inverse to the schema commit or change existing behavior for arbitrary application-authored mixed transactions.
Preserve the synchronous revertible-factory lifetime inside the change event.

Preserve separate history through serialization and loading using existing commit formats.
Internal attempt bookkeeping belongs in the controller, not user metadata.
Do not add a logical history projection or reinterpret revision arguments.
An original revision can remain before a retry schema commit; the normal cross-schema `revertTo` restriction still applies.
The gate is an executable data-only undo/redo sequence through the real publication path.

### M7. Complete every operation path and persistence boundary

**Documentation first**

Maintain an operation-to-owner table beside the controller contract.
State whether each operation authors work, transfers existing history, changes only view state, or performs runtime maintenance.
No "unsupported while upgrade pending" category is allowed.

**Tests first and implementation**

| Surface | Required coverage |
| --- | --- |
| Root, object, array, map, record, and moves | First and subsequent edits; generated no-effect changes; validation failures; identifiers and new node types. |
| Import and export | Imports trigger only when inserted; view exports reflect the local upgrade; base summaries exclude unpublished private state. |
| Transactions and constraints | Synchronous, nested, asynchronous, abort, labels, post-processing, and constraints on revert. |
| Application forks, merge, and rebase | Preserve isolation and history identity; no accidental direct publication from an application fork; no echo when merged through C2. |
| Serialized `applyChange` and history replay | Precede the existing application commits with a still-needed schema commit without rewriting their revisions into a combined commit. |
| Undo, redo, `revertTo`, and `rewindTo` | Exercise both pending and completed deferral with existing API restrictions unchanged. |
| Named shared branches and independent views | No assumption that the base is the main shared branch or has a runtime that emits sequencing events. |
| Uninitialized or detached trees | Initialization remains explicit; attach and load use consistent base state; no fabricated acknowledgement wait. |
| Sandboxing and other API wrappers | Preserve contracts for views they create or consume; no controller assumption that transport or another wrapper owns the base. |
| Reconnect, runtime rollback, resubmit, and summary/load | Correct attempt classification, schema/data order, identity, and retention. |
| Disposal and long sessions | Private resources are bounded by live work; no listener leaks or indefinite history retention after acknowledgement. |

Audit exported entry points and callers, not only field editors.
In particular, `applyChange`, merge, and history operations bypass parts of the normal field-edit path.
Complete their identity and publication handling instead of disabling them.
The gate is a filled operation matrix backed by focused tests.

### M8. Expose the opt-in and complete validation

**Documentation first**

Finalize the configuration default and examples, compatibility behavior, transaction abort behavior, data-only undo, and deliberate failure contract.
Put public contracts in source comments and executable examples in tests.
Keep internal branches, retry records, and workaround selection out of the public API.

**Tests first and implementation**

- Add the alpha configuration option and preserve it when views fork or configuration is copied.
- Verify default-mode behavior with existing suites.
- Add type tests for the option and confirm that public APIs gain no pending-status property.
- Run the end-to-end tests, relevant snapshot/codec tests, and production-style tests.
- Add focused fuzz coverage for remote schema changes, transaction boundaries, retries, and long-lived synchronization.
- Measure opening, first publication, steady-state edits, and retained resources.
  Compare with a baseline rather than invent a performance threshold without measurements.
- Generate entry points and API reports through existing scripts.
- Add a user-facing changeset following the [changeset guidelines](../../../../../.changeset/README.md).

Do not publish the opt-in until M0 through M7 meet their gates.
An intermediate internal implementation is not a supported partial feature.

### M9. Remove temporary rebase workarounds

When full schema/data rebase support is available for the supported collaboration baseline:

1. Run the common behavior tests against the standard rebase path.
2. Cover both directions, concurrent schemas, ordered schema/data publication, and application-authored mixed transactions.
   Verify dependency and partial-outcome behavior instead of assuming the old rejection cascade remains.
3. Verify node lifetime, constraints, encoding, resubmit, and mixed-version behavior.
4. Replace the adapter selection at its single construction point.
5. Delete obsolete schema reconstruction and retry transformations.
6. Keep the controller, one-retry policy, retained-work safeguards, undo behavior, and contract tests.
7. Remove stale workaround documentation and obsolete implementation-specific tests.
   Keep regression tests for the original failure scenarios.

A version number or calendar date alone does not establish that removal is safe.
Do not remove a workaround while another supported path still requires it.

## 5. Isolating the current rebase limitations

### Boundary

The temporary adapter receives an explicitly retained base, a current base snapshot, local schema intent, and retained application changes.
It returns a valid reconciliation/publication plan or an explicit reason that safe recovery is impossible.
Revise the initial single-change result type to describe the ordered members needed by the selected strategy.
Preserve member identity where possible, identify new retry revisions explicitly, and exclude accepted work.
Do not hide another schema/data composition inside the adapter merely to fit the old result type.
It must not publish, emit application events, reset retry state, or select public view behavior.
The permanent controller owns those actions.

Existing branch algorithms can be used on isolated retained or scratch branches inside this boundary.
If that requires mutation, keep it local and document ownership.
Do not claim that a helper is pure when it mutates a live checkout.

Use one construction point to select the current adapter or the future standard-rebase path.
Do not scatter capability checks across setters, event handlers, and codecs.
Keep the adapter contract narrow; do not create a general plug-in system.
Use existing collaboration-version policy if a capability gate is necessary.
Do not introduce a public workaround switch.

### Cases and removal criteria

| Case | Interim behavior | Removal evidence |
| --- | --- | --- |
| Schema over data before application work | Refresh the private schema-only state while preserving the view. | Standard rebase retains the upgrade and produces a consistent view update. |
| Concurrent schemas before application work | Check received-schema viewability first; cancel obsolete deferral or compute a valid remaining target. | Standard schema/schema reconciliation works; retain the permanent viewability exit rule. |
| Data over schema with retained user work | Safely transform retained edits or fail-stop; never discard them through schema-only refresh. | Standard data/schema rebase handles the same edits and constraints. |
| Ordered schema/data publication and mixed application history | Reconstruct one valid ordered retry when possible, without replaying accepted members or callbacks. | Standard rebase, sequencing, and resubmit preserve dependency and partial-outcome contracts. |
| Concurrent upgrades with dependent edits | Reconcile schema and retained data together, within the one-retry budget. | Complete schema/schema and mixed-change coverage passes. |

Document each workaround with:

- The current limitation and source location.
- The exact cases it handles and the preconditions for safety.
- Why it cannot lose or partially accept application edits.
- Its owning module and tests.
- The condition for deleting it.
- A tracking work item only when an actual identifier is available.

Use a short TSDoc contract and targeted `@privateRemarks` rather than repeating the entire proposal in comments.
Keep one internal explanation for the temporary algorithm.
No TODO should imply that retry safety or data-only undo can be deferred until after release.

## 6. Test clarity and diagnostics

Follow the [package test conventions](../../src/test/README.md).
Use `.spec.ts` files for module contracts and an integration file only for a clear multi-component scenario.
Name top-level unit suites after the module.

### Style rules

- Give each test one primary behavior and a descriptive name.
  Several assertions can prove that behavior; avoid one scenario that tries to prove the whole feature.
- Use small, named schema fixtures with stable identifiers.
  A covering-schema test must explicitly opt into the compatibility that makes it viewable.
- Use explicit steps: create clients, apply local upgrade, deliver a remote change, perform an edit, assert.
  Keep the event-delivery step visible in the test.
- Use deterministic mock message delivery.
  Do not use sleeps, timing guesses, or random schedules in ordinary regression tests.
- Keep helpers small and named for their effect.
  Do not hide edits, message delivery, or assertion failures inside generic setup callbacks.
- Prefer named local variables and direct assertions to large parameterized matrices with opaque flags.
  Parameterize a small set of forest variants only when the scenario remains readable.
- Assert values with actionable context.
  Separate commit counts, subchange order, schema state, data state, and event traces so a failure identifies the broken contract.
- Restore observers and dispose owned resources in cleanup.
  Keep a runtime failure assertion separate from cleanup that might obscure the original error.

Example test names:

- `keeps the base schema unchanged after a local upgrade`
- `publishes the schema commit before the first data commit`
- `keeps the local upgrade after an inner transaction abort`
- `stops preparing the upgrade after a viewable remote schema`
- `retries a rejected publication once without rerunning the callback`
- `fails the tree when the retry is rejected`
- `undoes the first data edit without reverting its schema`
- `does not republish a local edit after its base acknowledgement`

### Evidence to capture

| Question | Evidence |
| --- | --- |
| Did reading mutate the shared document? | Base head, base stored schema, submitted commit count, and summary content. |
| Was publication ordered and transaction-safe? | Separate schema/data commits in order, no submission on application abort, and explicit partial-submission and reverse-rollback tests. Do not equate transport batching with atomic acceptance. |
| Were partial outcomes handled safely? | Per-member schema/data results, no replay of accepted work, and no false joint success on the first acknowledgement. |
| Were edits duplicated? | Logical edit identity, publication records, node identity, and final data on all clients. |
| Did retry stay bounded? | Initial/retry application attempts, callback count, fatal-error observation, and proof that no third attempt was submitted. |
| Did undo preserve schema? | Data before/after undo and schema on each client, including after retry. |
| Were resources released? | Owned subscription/branch records and retained history after acknowledgements and disposal. Do not rely on nondeterministic garbage collection. |

Use real schema-conflict behavior in integration tests while the current rebaser remains in use.
A test double can isolate controller transitions, but must not be presented as evidence that the planned full rebaser exists.
Keep future standard-rebase acceptance cases available through the same scenario helpers without enabling a fake permissive rebaser in production.

## 7. Validation commands and completion gates

Use the existing scripts in [package.json](../../package.json).
Keep the [Mocha configuration](../../.mocharc.cjs) and required [test hooks](../../src/test/mochaHooks.ts).
The package recommends filtering suites rather than bypassing its configuration.

For implementation increments, start with:

```sh
pnpm --dir packages/dds/tree run build:esm
pnpm --dir packages/dds/tree run build:test:esm
pnpm --dir packages/dds/tree run test:mocha:esm --grep 'viewBranch|deferredSchemaRebase|deferred schema upgrades'
```

The first two suite names correspond to the proposed new modules.
Use `deferred schema upgrades` for focused integration suites added to existing test files.
Adjust the filter to the actual names if those module names change.
Add directly related existing suites for the increment under test.

For changed TypeScript files, use focused existing tools:

```sh
pnpm --dir packages/dds/tree exec eslint <changed-TypeScript-paths>
pnpm --dir packages/dds/tree exec biome check <changed-supported-paths>
```

Replace the placeholders with package-relative paths.
Do not add tooling or install dependencies unless an existing required command reports a missing dependency or a manifest change requires it.

After the focused gates pass, use the relevant broader checks:

```sh
pnpm --dir packages/dds/tree run test:mocha
pnpm --dir packages/dds/tree run depcruise
pnpm --dir packages/dds/tree run build
```

For the API introduction, regenerate and validate through the existing pipeline:

```sh
pnpm --dir packages/dds/tree run generate:entrypoint-sources
pnpm --dir packages/dds/tree run build
pnpm --dir packages/dds/tree run build:api-reports
pnpm --dir packages/dds/tree run check:exports
pnpm --dir packages/dds/tree run build:docs
```

Run API Council, changeset, and compatibility checks required by repository policy before release.
Do not manually repair generated reports.
Extend existing fuzz and benchmark suites rather than add another runner.
Use a bounded, reproducible seed set for the change; expand only after focused failures are understood.

### Release gate

The feature is complete only when:

- Every agreed requirement has a readable test and an implemented contract.
- C2 synchronization, first publication, one retry, fatal propagation, and data-only undo pass with the real implementation.
- Every existing public operation path is covered without new deferral-only restrictions.
- Equivalent, insufficient, and covering remote schema upgrades behave as specified.
- Required forest, runtime, codec, persistence, reconnect, and production-style checks pass.
- The immediate default retains its existing behavior.
- Temporary rebase work is isolated, documented, and has deletion criteria.
- Source documentation, executable examples, generated API reports, and the changeset agree with the code.
- Performance and retention measurements show no unexplained regression or unbounded accumulation.

This planning change does not implement the feature.
No feature tests or builds were run as part of writing this plan.
Validate the plan's links and Markdown separately from the future implementation checks above.
