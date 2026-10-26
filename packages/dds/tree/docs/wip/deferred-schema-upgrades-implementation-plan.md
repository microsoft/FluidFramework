# C2 deferred schema upgrades: implementation plan

## Status and scope

This plan implements the agreed [deferred schema upgrade design](./deferred-schema-upgrades.md).
It follows **C2: a persistent internal view branch**.
The source inspection for this plan used commit `24c481e3906` on 2026-10-26.
This document is a plan, not an implemented feature or a report of passing feature tests.

Proceed with C2 first.
Keep the application on one view checkout while a base checkout owns shared history and operation submission.
Publish application changes from view to base, and reconcile base changes into the view.
Keep this arrangement after the schema upgrade is accepted or becomes unnecessary.

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

### M0: baseline and primitive feasibility

The [branch primitive integration tests](../../src/test/shared-tree/deferredSchemaUpgrade.integration.ts) establish:

- A private upgrade enables its view without changing base history or submitting an op.
- Ordinary merge preserves separate schema and data commits.
- Composition and revision replacement can publish an earlier schema change and a later data change as one ordered commit.
- Ordinary reconciliation of that composed history currently replaces view nodes.
  The initial identity-preservation assertion failed; a characterization test records the current limitation.
  M3/M4 must prevent that replacement rather than weaken the public identity contract.
- A retained branch preserves the original application change when another branch's rebase drops it.
- For the tested schema expansion and concurrent array insertion, the existing data rebaser can transform the retained application change before a fresh schema prefix is added.
- Inverting the data portion of the controlled compound commit leaves the upgraded schema intact.

These proofs establish the primitive paths, not complete retry, notification, or undo APIs.
Use one publication revision and retain the original private history until reconciliation has completed.
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

[deferredSchemaRebase.ts](../../src/shared-tree/deferredSchemaRebase.ts) defines the isolated temporary adapter boundary.
It does not implement reconstruction yet.
The controller must own retained history, publication, and error handling; the adapter cannot report an unsafe transformation as an empty successful change.

Validation:

- `pnpm --dir packages/dds/tree run build:esm`: passed.
- `pnpm --dir packages/dds/tree run build:test:esm`: passed.
- `pnpm --dir packages/dds/tree run test:mocha:esm --grep '^viewBranch|deferred schema upgrades: branch primitives' --reporter dot`: 16 passed.
- `pnpm --dir packages/dds/tree exec eslint src/shared-tree/viewBranch.ts src/shared-tree/deferredSchemaRebase.ts src/test/shared-tree/viewBranch.spec.ts`: passed.
- `pnpm --dir packages/dds/tree exec biome check --write src/shared-tree/viewBranch.ts src/shared-tree/deferredSchemaRebase.ts src/test/shared-tree/viewBranch.spec.ts`: passed.

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

These are proposed filenames, not existing modules or new public APIs.
Add matching unit tests under [test/shared-tree](../../src/test/shared-tree).
Extract further files only when a cohesive responsibility or a demonstrated reuse case warrants it.
Keep schema/data composition helpers beside the existing change-family code when that is their natural owner.

The permanent controller must own:

- The borrowed base checkout and the owned view checkout.
- Internal schema-deferral state, separately from publication attempts and transaction state.
- Logical-edit records that link private changes, published revisions, retry revisions, and outcomes.
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
| Commit identity | Define how an earlier private schema commit and later application changes become one new publication. Map history and align the view so the original changes cannot be published again. |
| Local and remote event identity | A private checkout is not a shared branch. Its current event logic cannot simply be assumed to provide the same remote-change and settled events as the base. Define forwarding without duplicate logical notifications. |
| Retained work | Retain original changes, their base, constraints, detached content, and dependent edits before a lossy rebase. Define who owns each retained reference and when it is released. |
| Retry safety | Prove a safe reconstruction path for representative schema/data conflicts. An empty rebase result or a serialized change alone is not proof that the original intent can be recovered. |
| Undo projection | Define the data-only inverse in the correct upgraded context. Distinguish application abort from user undo and preserve revertible cloning, disposal, and history identity. |
| Fatal propagation | A private fork has its own breaker. Prove that a fatal synchronization failure stops the affected public tree/view and reaches the runtime or independent-view caller. Logging alone is insufficient. |

Use small executable proofs for atomic publication, retry, and undo.
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
| M4 | M3 | Atomic publication and transaction integration. |
| M5 | M4 | One safe retry and end-to-end fatal failure. |
| M6 | M5 | Data-only undo and correct logical history. |
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
- Prove that a local fork upgrade sends no op, ordinary merge preserves separate commits, and a compound change can encode schema before data.
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

**Tests first**

- Equivalent or covering remote schema ends deferral; an insufficient schema does not.
- Internal schema work, remote updates, rollback, and transport resubmission do not initiate publication.
- Initial confirmed rejection permits one retry; a failed retry is terminal.
- A new revision, remote schema, or dependent edit does not reset the allowance.
- Application-requested abort does not retry.
- Duplicate or stale notifications cannot advance the same logical operation twice.

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

### M4. Publish one compound change and preserve transaction semantics

**Documentation first**

Specify the publication boundary, revision mapping, and the lifecycle of the private schema commit.
Document the distinction between local application, submission, and accepted outcome.
Specify the event trace for a single edit and an enclosing transaction.

**Tests first**

- The first generated application change publishes one schema-before-data commit.
- Edits already valid under the old schema still trigger publication.
- Constraint-only and net-zero committed changes count; calls that generate no change do not.
- An application-requested inner or outer abort sends neither schema nor data and leaves the local upgraded view usable.
- An earlier successful inner edit is not erased by aborting a later inner transaction.
- A later edit after abort publishes the still-needed upgrade without another upgrade call.
- A sufficient remote schema arriving during a transaction cancels the obsolete prefix without losing application work.
- Post-processors preserve the agreed trigger and constraint semantics.
- The second and later edits never republish the original private schema or data.

**Implementation and gate**

Reuse change-family composition and revision-replacement helpers.
Do not treat an ordinary merge of separate schema and data commits as atomic.
The existing transaction squasher assumes its own revision allocation; do not concatenate arbitrary commits and assume that contract holds.

Retain the original work before publishing.
Reconcile the view's private history with the published revision without rebuilding nodes or mutating an already published edit's identity.
Preserve labels, custom metadata, and the original transaction grouping.
Exercise the normal encoding, enrichment, and submission path rather than call the runtime directly.

The gate requires assertions on the actual submitted commit shape, the view/base history relationship, and a subsequent edit.
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
- Retained work survives history trimming and detached-content cleanup pressure.
- Application callbacks with external side effects run only once.
- A fatal error reaches the host and prevents later access through the affected view/tree.

**Implementation and gate**

Use the adapter to prepare a valid new attempt against current state, not to rerun application callbacks.
Preserve application constraints and stable target identity.
Do not simply replay old indexes, strip all schema changes, or feed the same mixed change into the rebaser that dropped it.

Start with a proof for monotonic local expansion over remote data edits.
Investigate separating the known internal schema prefix from application changes only where their contexts and identifiers can be transformed safely.
Use existing data rebase machinery for proven compatible contexts.
For remote schema changes or mixed histories, check schema compatibility and data interpretation explicitly before taking that path.
If the checks cannot prove a safe reconstruction, return a terminal failure result rather than an empty success.
The plan does not assume this transformation is already provided by the codebase.

Retain dependent edits until the publication outcome is resolved.
Route one new attempt through normal submission, with its own attempt identity linked to the original logical edit.
Keep the retry count independent of pending-schema state.

The gate is real multi-client rejection and recovery, plus the fatal path.
Injecting an outcome is useful for unit tests but is not sufficient integration evidence.
Do not clear a broken-state marker to keep a failed scenario running.

### M6. Provide data-only undo and stable history

**Documentation first**

Specify that user undo retains the schema, while an application abort cancels the transaction's publication.
Define how revertibles refer to the logical edit before and after a retry.
Document history and serialization behavior without exposing internal attempt bookkeeping.

**Tests first**

- Undo of the first data edit retains the upgraded schema on all clients.
- Redo restores the data without another schema upgrade.
- Undo works after intervening data edits, a successful retry, and remote-schema cancellation of deferral.
- A revertible can be cloned to an eligible application fork and disposed normally.
- History traversal, labels, custom metadata, and outcomes do not duplicate internal attempts.
- Supported `revertTo` and `rewindTo` operations preserve their documented semantics.
- Schema-only edits and arbitrary mixed-schema operations retain their existing restrictions where those are already part of the API.

**Implementation and gate**

Create the data inverse in the upgraded context and retain its repair data.
Do not remove `hasSchemaChange` guards globally or blindly invert the whole compound commit.
Recognize the controlled deferred-upgrade operation without conflating it with an arbitrary schema/data transaction.
Preserve the synchronous revertible-factory lifetime inside the change event.

Resolve whether recognition is local or must survive serialized replay and history loading.
If durable identification is required, handle it through an approved compatibility design, not user metadata or a manually edited codec format.
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
| Serialized `applyChange` and history replay | A first imported application change can trigger atomic publication without rewriting its existing revision to mean a different authored edit. |
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
2. Cover both directions, concurrent schemas, separate upgrade/edit history, and compound publication commits.
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
| Compound publication or separate upgrade/edit history | Reconstruct one valid retry when possible, without replaying callbacks. | Both forms work through the standard rebase, sequencing, and resubmit paths. |
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
- `publishes schema before data in the first application commit`
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
| Was publication atomic? | One submitted tree commit containing ordered schema/data subchanges. Do not equate transport-envelope count with commit count. |
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
