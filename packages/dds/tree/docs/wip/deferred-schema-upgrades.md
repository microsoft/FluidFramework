# Deferred schema upgrades for SharedTree

## Status and recommendation

This document is a design proposal, not a description of a supported feature.
See the [C2 implementation plan](./deferred-schema-upgrades-implementation-plan.md) for documentation-first, test-driven milestones and temporary-workaround isolation.
It is based on source inspection at commit `762ef9aa310`, on 2026-10-22, with follow-up checks on 2026-10-26 and 2026-10-27.
The supplied checkout snapshot matches the source at this revision.
The implementation plan records completed foundations and work still required before exposing the feature.
Focused runtime checks of existing branch behavior are recorded in Section 9.

**Agreed direction: proceed first with C2, a persistent internal view branch.**
The publication strategy agreed on 2026-10-27 is an ordered schema commit followed by the application data commit, not a single combined commit.
Preserve the original commit identities on the normal publication path.
Compaction and mixed-commit undo projection are no longer prerequisites for C2.
Keep the view branch for the lifetime of the view and synchronize it with the base branch.
Ending schema deferral does not require ending the branch.
Plan for early delivery before the full schema/data rebase work is complete, using isolated temporary workarounds where required.
Use one safe retry after rejection or synchronization rollback of the initial upgrade/edit attempt, then fail-stop if the retry fails.
Require data-only undo: undoing the application edit must retain the schema upgrade.
Support all existing public editing, branching, replay, and history operations without new restrictions caused by deferral.
Options A, B, and C1 remain documented alternatives, not parallel implementation commitments.
In every option, the application explicitly calls the upgrade API to enable the newer schema locally.
That call sends no upgrade op in deferred mode.
After the first application-originated change commits locally, submit any still-pending schema commit before the application commit.
If an incoming remote schema makes the document viewable as-is, end deferral and use normal editing without publishing the pending upgrade.

Option B uses the same local view schema but starts an internal transaction before it applies the upgrade and the edit.
It can reuse more of the existing schema-edit path.
It must manage more transaction state, but it does not need to determine whether a change affects document content.

Option C applies the local upgrade on an internal branch, then publishes its changes to the main branch on first edit.
It can keep that branch afterward and synchronize subsequent edits with the base branch.
Current branch APIs support local schema changes, but ordinary rebase does not preserve them across concurrent content changes.
Ordinary merge preserves separate commits; that matches the selected publication strategy.

The team has confirmed that the scheduled work covers schema changes over data changes, data changes over schema changes, concurrent schema changes, and mixed schema/data changesets.
As of 2026-10-26, the expected delivery is in a couple of months.
This is a planning dependency, not an implemented capability or a committed release date.
That work should remove the workarounds for the current rebaser's blanket rejection of these combinations.
It does not mean that every conflicting edit can be accepted or that genuinely incompatible schemas become compatible.
It does not by itself remove ordered-submission, view-lifetime, transaction, or undo requirements.
Option C below separates temporary workarounds from work required in either case.

All options need changes beyond the compatibility check.
Three current behaviors need implementation work:

- A commit that includes a schema change does not provide a revertible; keep the automatic upgrade separate so the data commit can use its native revertible.
- Concurrent changes can cause a commit that includes a schema change to be dropped.
- A stored schema change disposes the current view context and its node wrappers.

Do not ship automatic upgrades without meeting the agreed undo, recovery, and view-lifetime requirements.
In particular, making the first user edit non-undoable is not an acceptable fallback.

## 1. Problem and agreed requirements

A new application version can have a view schema that permits more content than an existing document permits.
Today, the application must upgrade the stored schema before it can use that view.
The upgrade changes the document and sends an operation, or **op**, to other clients.
This can prevent older clients from continuing to use their views.

Opening a document for reading must not require this edit.
Some applications also require each document edit to follow an explicit user action.

The agreed requirements are:

1. Make deferred upgrades opt-in for now.
   Keep the current default behavior.
2. Require an explicit upgrade call before a view that needs an upgrade becomes usable.
   In deferred mode, this call applies the upgrade locally without sending an upgrade op or changing the shared branch.
3. Publish the pending upgrade with the first application-originated local change that would otherwise be committed.
   Publish it even when that change is valid under the old document schema.
   Do not filter changes by their effect on document content.
   If an incoming remote schema has already made the document viewable as-is, discard the pending upgrade instead and return to normal behavior.
4. Publish the schema commit before the triggering application commit, preserving their separate identities.
   Correlate their outcomes for recovery, but do not promise all-or-nothing acceptance of both commits.
   An already accepted schema can remain when the later data edit fails.
5. Publish neither change if the application aborts the triggering transaction.
   Keep the view locally upgraded and readable, with publication pending again.
   Do not require another upgrade call.
6. Do not publish an upgrade for a transaction or mutation attempt that produces no application-originated change.
   Preserve the existing edit builders' handling of such calls.
   Exclude internal schema preparation, branch refresh, remote processing, and rollback from the trigger.
7. If the initial publication is rejected or rolled back by synchronization, retain the upgrade intent and user edits.
   Attempt one internal retry when their intent and constraints can be preserved.
   If that retry is rejected or rolled back, fail-stop; do not make a second retry.
   If safe recovery is not possible, fail-stop the affected tree rather than continue after dropping edits.
   Bound recovery work so that repeated rejection cannot cause an endless retry loop or an unresponsive client.
8. Keep deferred publication opaque to the application.
   After `upgradeSchema()` succeeds, expose the locally upgraded schema through the existing view APIs.
   Do not add a pending-upgrade status or require an application-managed publication or recovery workflow.
9. Do not require the private view branch to be removed after deferral ends.
   Proceed first with C2: a continuously synchronized view branch for the lifetime of the view.
10. Let the user undo the data change without reverting the accompanying schema upgrade.
    Preserve this invariant after retries and through persistent-branch synchronization.
11. Support all existing public editing, branching, replay, and history operations in deferred mode.
    Do not add a restriction solely because a schema upgrade is pending.
    Existing API restrictions remain unchanged.

This feature is not an access-control system.
A view with this option can still make edits.
The application remains responsible for deciding when a user can edit.

### Terms

| Term | Meaning in this proposal |
| --- | --- |
| Stored schema | The schema in a checkout's state. A private checkout can have schema changes that are not yet shared. |
| Document schema | The schema on the shared branch, or its independent-tree equivalent. Pending private upgrades must not enter its summaries. |
| View schema | The schema that defines the application's typed tree API. |
| Upgrade target | The stored schema that an explicit upgrade would produce under the configured policy. |
| Effective schema | A local schema used to interpret fields and prepare edits for this view. It is not itself a document change. |
| Pending upgrade | A local state established by an explicit upgrade call. The view can be used, but the upgrade is not yet published to the shared branch. |
| Triggering edit | The first application-originated local change that would otherwise be committed, regardless of its effect on document content. |
| Publication attempt | One coordinated attempt to publish the still-needed schema commit and associated application commits in order. It can contain more than one op. |

## 2. What the current code does

### Compatibility and view creation

[checkSchemaCompatibility](../../src/simple-tree/api/schemaCompatibilityTester.ts) computes `canView`, `canUpgrade`, and `isEquivalent`.
It also reports staged-upgrade status.
`canView` currently describes read/write access, not just safe reads.
An extra non-staged allowed type in the view can make `canView` false.

[SchematizingSimpleTreeView](../../src/shared-tree/schematizingTreeView.ts) creates a FlexTree context only when `canView` is true.
Its root getter and setter also check this status.
Its `upgradeSchema` method:

1. Computes a target with `toUpgradeSchema`.
2. Checks that the target permits all documents permitted by the stored schema.
3. Returns without an edit if the two schemas permit the same content.
4. Calls `checkout.updateSchema` otherwise.

The target depends on the staged-upgrade policy.
The policy can also retain upgrades already enabled in the document.
Do not compute a target once at view creation and assume that it remains valid.

### Fields, validation, and content preparation

[Context.schema](../../src/feature-libraries/flex-tree/context.ts) currently returns `checkout.storedSchema`.
This schema does more than validate data:

- [LazyTreeNode](../../src/feature-libraries/flex-tree/lazyNode.ts) caches a node schema.
- [LazyField](../../src/feature-libraries/flex-tree/lazyField.ts) selects an editor from the field kind.
- [prepareForInsertion](../../src/simple-tree/prepareForInsertion.ts) validates inserted content against the destination schema.
  Validation in a hydrated context is currently enabled independently of `enableSchemaValidation`.
- The root setter directly supplies `checkout.storedSchema.rootFieldSchema`.
- The optimized forest's [chunker](../../src/feature-libraries/chunked-forest/chunkTree.ts) uses stored node schemas to prepare content.
  An unknown type can cause a missing-schema assertion.

Thus, making `canView` true is not sufficient.
New optional fields, wider allowed-type sets, and required-to-optional changes need the correct field interpretation before the first edit.
Content with a new type must also pass validation and chunk preparation.

Existing [compatibility tests](../../src/test/simple-tree/api/schemaCompatibilityTester.spec.ts) include object-to-map and object-to-array upgrades.
These are additional reasons not to treat every upgrade as a change to an allowed-type set.

### Edits and transactions

The normal content-edit path is:

```text
Typed node or root mutation
  -> insertion validation and content preparation
  -> FlexTree field editor
  -> SharedTreeEditBuilder
  -> SharedTreeBranch.apply
  -> checkout delta application and commit submission
```

[SharedTreeEditBuilder](../../src/shared-tree/sharedTreeEditBuilder.ts) produces an ordered list of data and schema subchanges.
[SharedTreeChangeFamily](../../src/shared-tree/sharedTreeChangeFamily.ts) already composes these lists.
Its rollback inverse reverses their order.
The [change codec](../../src/shared-tree/sharedTreeChangeCodecs.ts) uses an earlier schema subchange when it encodes later data subchanges.
The basic format can therefore represent an upgrade followed by an edit.

[SquashingTransactionStack](../../src/shared-tree-core/transaction.ts) applies transaction edits on a private branch.
It squashes them onto the original branch at commit.
An abort removes the transaction changes and updates the checkout.
Nested transactions and asynchronous transactions use this machinery.

Do not add the upgrade from a change-event listener.
[SharedTreeCore](../../src/shared-tree-core/sharedTreeCore.ts) starts commit submission from branch `beforeChange` events.
By then, the publication sequence must already contain the correct schema and data in order.
The checkout also prohibits edits during change callbacks.

### View lifetime, undo, and concurrency

On a stored schema change, [SchematizingSimpleTreeView.update](../../src/shared-tree/schematizingTreeView.ts) unconditionally replaces the FlexTree context.
It disposes cached tree nodes.
Calling the current `upgradeSchema` implementation from a setter can therefore invalidate the node or field that the setter is using.

[TreeCheckout](../../src/shared-tree/treeCheckout.ts) omits revertibles for every commit that contains a schema change.
The [checkout tests](../../src/test/shared-tree/treeCheckout.spec.ts) cover this behavior for schema-only and mixed schema/data commits.
`revertTo` also rejects traversal across a schema-change commit.

[SharedTreeChangeFamily.rebase](../../src/shared-tree/sharedTreeChangeFamily.ts) returns an empty change when either nonempty input includes a schema change.
The [change-family tests](../../src/test/shared-tree/sharedTreeChangeFamily.spec.ts) and [checkout tests](../../src/test/shared-tree/treeCheckout.spec.ts) confirm that such changes can be dropped.
Ordering and runtime batching do not remove this concurrency limitation.

## 3. Proposed behavior

### Eligibility

Let `S` be the current document schema and `U` be the current upgrade target.
Permit an explicit upgrade call to establish a pending upgrade only when all of these conditions hold:

1. The document is initialized.
2. The option is enabled.
3. `U` is a valid upgrade from `S` under the existing upgrade policy.
4. The view can use `U` under the existing compatibility rules.
5. The effective-schema implementation can represent the permitted field and node shapes without a data conversion.

The safety argument is that every document permitted by `S` is also permitted by `U`.
The view can interpret the document through `U` without changing the document.
The edit path must then install `U` before it applies content that depends on `U`.
Option C installs `U` on a private checkout first, not on the shared branch.
Configuration alone must not grant access to a view that currently needs an upgrade.

Check the target's view compatibility explicitly.
Do not use `canUpgrade` as the only new root-access check.
Keep existing handling for incompatible schemas and uninitialized documents.
Do not scan current content as a substitute for schema compatibility.
A remote client can still make any edit permitted by `S`.

### Configuration and status

Agreed API name: `schemaUpgradeMode: "immediate" | "deferred"`.
Add it to [TreeViewConfigurationAlpha](../../src/simple-tree/api/configuration.ts) first.
Use `"immediate"` as the default.
The name is accepted for this design.
The final API surface and release tag still need the repository's normal API review.

Both modes require an explicit application call to `upgradeSchema()`.
The mode controls publication after that call.
It does not cause an upgrade when the view opens.

The intended flow is:

1. Create the view and inspect compatibility.
2. If an upgrade is needed and permitted, call `upgradeSchema()`.
3. In deferred mode, enable the local view without sending an upgrade op.
4. Read the view as needed.
5. After the first application-originated change commits locally, publish any still-pending schema commit before the application commit.
   If a remote schema change has already made the document viewable as-is, use normal editing without publishing the upgrade.

After `upgradeSchema()` succeeds, the application can use the document as locally upgraded.
Deferred publication is an internal responsibility, not an additional application state.
Use the existing compatibility properties with the same local meaning as after an immediate upgrade:

| Property | Behavior after a successful local upgrade | Meaning |
| --- | --- | --- |
| `canView` | `true` | The application can read and edit the upgraded view. |
| `canUpgrade` | Existing calculation against the locally upgraded schema | Pending publication does not change this result. |
| `isEquivalent` | Existing calculation against the locally upgraded schema | Report equivalence when an immediate upgrade to the same schema would report it. |
| `discrepancies` | `undefined` | Preserve the contract that this reports reasons why root access fails. |

Do not add `upgradePending` or another public publication-status property.
Keep the distinction between `S` and `U` inside the implementation for replication, summaries, and reconciliation.
View-facing schema queries must not report the older `S` merely because publication is deferred.
A helper that explicitly compares supplied schemas must still report the result for those inputs.
Do not rewrite stored-schema test fixtures or summaries to pretend that an unpublished upgrade is already shared.
The implementation must keep these internal concerns consistent without exposing them as additional view states.

In immediate mode, preserve the existing `upgradeSchema()` behavior.
In deferred mode, the call establishes local upgraded state and permission to publish it with a later edit.
A repeated call must not create duplicate private upgrades or force publication.
An API for explicitly forcing schema-only publication is a separate decision.
Keep initialization explicit.
Do not initialize an empty document as a side effect of reading its root.

If the view already has access but its staged-upgrade policy requests a further expansion, an explicit upgrade call can establish the same pending state.
Do not enable staged changes that the policy excludes.
`isStagedUpgradeEnabled` must report the locally upgraded schema, just as after an immediate upgrade.
Keep any separate tracking of replicated staged upgrades internal.

### End deferral when a remote schema makes the document viewable

After applying an incoming remote schema change, check whether that shared schema is viewable as-is with the local view schema.
Use the ordinary read/write compatibility check against the received schema.
Do not use the locally upgraded private schema or the deferred-access override for this check.
Those already permit access and cannot establish that the shared schema is sufficient.

If the ordinary check reports `canView: true`:

1. Adopt normal view behavior against the received schema.
2. Cancel the unpublished deferred upgrade.
3. Stop deferred-upgrade preparation and schema-only refresh.
4. Continue normal editing and release resources used only for deferral when safe.
   The internal view branch and its synchronization can remain active.
5. Do not attach the cancelled upgrade to later edits or recreate it when a transaction aborts.

Viewability is the exit condition.
The received schema does not need to be identical or equivalent to `U`.
Do not require `isEquivalent` or `canUpgrade` to be true.
For example, the normal compatibility rules can permit viewing a document with additional unknown optional fields without permitting an upgrade to the local target.
That document no longer needs this deferred upgrade.

This is a permanent rule for all options, not a temporary rebase workaround.
For Option C, either use the stable ownership transition or retain the synchronized view branch, as after local publication.
Here, "normal behavior" means that edits no longer carry the cancelled upgrade.
It does not require a change in branch ownership.
Discard only internal pending schema work, not application edits.
An open transaction or retained application work must be reconciled safely before its private state can be released.
If that work cannot be preserved under the adopted schema, use the retry-or-fail-stop contract; do not silently discard it or restore the cancelled upgrade.

An op already submitted cannot be retracted by this local transition.
Keep the required outcome tracking and recovery data for in-flight application edits until their outcome is known.
Do not generate a new attempt that includes the now-unnecessary deferred upgrade.

Expose no new status or event solely for leaving deferred mode.
Existing schema and content notifications still apply to the actual remote change.
Normal compatibility tracking continues afterward, including handling future schema changes or a later explicit application upgrade.
The cancelled deferred upgrade itself must never be resurrected.

### What triggers publication

Include the pending schema upgrade with the first application-originated local change that would otherwise be committed.
The change does not need to alter the final document content.
Do not add delta profiling, structural comparisons, or value comparisons to decide whether to publish.

| Action after the local upgrade call | Publish pending upgrade |
| --- | --- |
| Read, observe, export, or dispose a view | No |
| Create or edit an unhydrated node | No |
| Receive remote data or a remote schema change | No; a remote schema that makes the document viewable as-is also ends deferral |
| Prepare the internal schema upgrade, refresh a private branch, or apply rollback | No |
| Open and commit a transaction that produces no application-originated changes | No |
| Call an edit method that returns without creating a change | No |
| Commit an application-originated local change, including one valid under `S` | Yes |
| Commit an equal-value replacement or another change with no net content effect | Yes |
| Commit a constraint-only change | Yes, if the normal change pipeline creates a commit |
| Repeated `upgradeSchema()` in deferred mode | No |

Use the existing change pipeline rather than every invocation of a mutation method.
For example, the [sequence edit builder](../../src/feature-libraries/default-schema/defaultEditBuilder.ts) already returns without a change for an empty insertion or a zero-count removal.
Do not add filtering to these paths.
Conversely, if an existing path creates a change with no content effect, that change can carry the pending upgrade.

If changes cancel out within a transaction that is committed, retain the upgrade.
If the application aborts the transaction, remove the publishable change, but retain the locally upgraded view.
This is an intentional cancellation of user work.
Rejection during publication or rebase is not an application-requested abort.
In that case, retain the user edits for safe retry, or fail-stop if recovery is not possible.
Do not impose a separate requirement for a nonempty final transaction delta.

The required checks concern origin and lifecycle, not content effects:

- Distinguish application-originated changes from internal schema work, remote changes, and rollback.
- Wait for the enclosing transaction to commit before publication.
- Do not leave a published schema-only change when a mutation fails validation.
- Preserve normal behavior when an edit method produces no change.

## 4. Common implementation work

Options A and B use one live checkout and a local effective schema.
Option C uses a separate private checkout with its own stored schema.
All options must preserve the same public view behavior and meet the same internal recovery requirements.

### Separate document schema from view interpretation

For Options A and B, keep `checkout.storedSchema` as the authoritative document schema.
Summaries, incoming change processing, and branch history must continue to use it.
Do not temporarily replace it with `U` merely to permit reads.
For Option C, the private checkout can legitimately store `U`.
Only the shared checkout contributes the document schema to shared history and summaries.

Allow the hydrated FlexTree context to use an effective schema:

- Use `U` while an upgrade is pending.
- Use a compatible effective schema after the upgrade.
- Keep it unchanged across the automatic `S`-to-`U` transition when its interpretation has not changed.
- Recompute eligibility when the stored schema changes.

Use that same effective schema in root edits, object fields, arrays, maps, records, and move validation.
Do not mix a field kind from `U` with a destination schema from `S`.

The effective schema must preserve all data that the current compatibility policy permits the view to encounter.
This includes tolerated unknown optional fields.
Do not bypass staged-schema restrictions by using the fully permissive schema intended for unhydrated nodes.

### Keep node references valid

Split compatibility updates from context replacement in `SchematizingSimpleTreeView`.
For the automatic upgrade, update stored-schema status without disposing nodes whose effective interpretation has not changed.
The same rule must cover transaction rollback to `S`.

This requires an explicit context-reuse check.
`LazyTreeNode` caches a node schema, and fields cache their kind.
Simply skipping `disposeFlexView` for every schema change would be incorrect.
Preserve the existing invalidation behavior when a remote change makes the view incompatible.

These cases must work:

```text
root = view.root
child = root.child
perform first edit through child
continue to read and edit root and child
```

Also test a new optional field that was read before the first edit.
Do not retain a field wrapper with the old forbidden or required field kind.

### Track local authorization, transaction state, and recovery separately

Record that the application explicitly applied a local upgrade.
Derive publication status from this authorization, the document schema, and the active transaction.
Do not use one flag for both local access and successful publication.
These states are internal.
They must not require applications to inspect publication status before reading or editing.

The local schema commit can predate the first application transaction.
Keep it private until that transaction's outermost commit succeeds.
An application-requested inner or outer abort discards its application edits without publishing the pending schema on their behalf.
The local schema upgrade remains applied, and the view remains usable.
No upgrade op is sent for the aborted transaction.
If publication is still pending, the next committed user edit includes the schema upgrade.
If a remote schema change has ended deferral, an abort must not restore the cancelled pending upgrade.
Do not retry edits that the application intentionally aborted.

Deferral applies to each new upgrade request, not only the first upgrade on a view.
Keep a later unpublished request separate from an earlier publication that is awaiting its outcome.
Acknowledging or retrying the earlier publication must not discard the later request.
Coalesce compatible upgrades that are still private into one upgrade from the shared schema to the latest requested target.
Do not attempt to replace an op already submitted to the runtime.
When reconstructing a retry, coalesce upgrades whose application edits have already triggered publication, without publishing a later untriggered request early.

In deferred mode, a successful transaction that contains only upgrade requests keeps those upgrades private.
A later application-originated change triggers publication.
Immediate mode retains its existing publish-on-commit behavior.
An upgrade requested inside an aborted transaction rolls back with that transaction.
This does not roll back an upgrade applied before the transaction began.
Keep the existing semantics and restrictions for application-authored transactions that contain both schema and data changes.

Distinguish an application-requested abort from a commit dropped during reconciliation.
An abort does not remove a local upgrade applied before the transaction or publish the aborted work.
A rejected commit requires safe internal retry or fail-stop behavior as described in Section 7.
Do not require the application to reapply its schema upgrade or manage publication retries.

An asynchronous transaction can receive remote changes on its base branch.
The transaction's commit must use the existing rebase path.
Recheck the resulting schema and pending state after reconciliation.

### Keep events consistent

Process the schema commit before the data commit and keep each checkout update consistent.
Separate messages can expose a schema-only intermediate state on a peer; do not claim cross-commit atomic visibility.
If the implementation requires non-interleaving or one runtime batch boundary, establish that boundary explicitly.
Update compatibility and staged-upgrade status in time for callbacks that inspect the final state.
Keep edit locks active during notification.

Proposed opt-in event behavior:

- The explicit local upgrade call notifies applications when compatibility changes, without claiming that a shared commit was made.
- Preserve the data commit's normal `changed` notification and native revertible.
- Keep schema and data settlement separate internally; correlate them without emitting the data edit twice.
- Preserve the user transaction's labels, custom metadata, and commit kind.
- Do not add a synthetic user-visible transaction label.
- Notify `schemaChanged` for the local schema transition after the state is consistent.
- Do not emit an additional schema notification solely to expose publication of an already applied local upgrade.
- Coalesce `rootChanged` notifications from the upgrade and the triggering edit.
- Preserve the normal per-edit node notifications inside an existing transaction.

Specify and test exact event order.
The current `runSchemaEdit` suppression logic is useful prior art, but is not sufficient by itself.

## 5. Option A: add the upgrade to a prepared change

This is a retained single-commit alternative, not the selected C2 strategy.
Its normalization and content-preparation requirements do not apply merely because C2 defers a schema upgrade.

### Option A design

Prepare the local change against the effective schema.
Before the change becomes a branch commit, check whether it is the first application-originated change with a pending upgrade.
If it is, add the schema change before the data change.

For an ordinary edit, the result is:

```text
one commit
  schema: S -> U
  data: triggering edit
```

This is one ordered change, not two independently submitted ops.

Recommended integration point: a narrow local-change preparation hook before the editor callback invokes `SharedTreeBranch.apply`.
Keep schema policy in the view/checkout layer.
Keep the generic branch layer unaware of view schemas.
Do not modify a commit after a branch event has exposed it.

The hook must apply to the active transaction editor as well as the normal checkout editor.
Transaction branches must use the hook for newly authored edits.
History-retention branches, internal schema work, rollback, and remote replay must not acquire it automatically.

### Edit sequence

1. Check disposal, edit locks, and the active view configuration.
2. Validate the mutation and prepare its content against the effective schema.
3. Build the data change without applying it.
4. Check its origin.
   Internal preparation and remote processing must not trigger publication.
   Do not inspect the change for document effects.
5. Recheck the current stored schema and upgrade target.
   If content preparation invoked application code that changed the context, fail explicitly before applying stale work.
6. If an upgrade is still needed, create the schema prefix from the current `S` to the validated `U`.
7. Apply the combined change with the edit's revision.
8. Let the existing transaction machinery submit it now, or include it in the enclosing transaction.

Do not call `upgradeSchema()` recursively from this hook.
Construct the combined change through shared schema-change construction logic.
Keep schema validation and metadata handling consistent with explicit upgrades.

### Content chunk preparation

This requirement is specific to Option A.
It concerns how new edit content is converted into chunks, not a redesign of forest storage.

Option A builds the content edit before it applies the combined schema and content change.
At that point, the view uses the locally upgraded schema `U`, but the destination forest still uses the document schema `S`.

The current insertion path is:

```text
Prepare insertion content
  -> FlexTree field editor
  -> MappedEditBuilder converts content into chunks
  -> destination forest's chunkField
  -> schema-based chunking policy in the optimized forest
```

[LazyField.getEditor](../../src/feature-libraries/flex-tree/lazyField.ts) supplies the chunk conversion to [MappedEditBuilder](../../src/feature-libraries/default-schema/mappedEditBuilder.ts).
[ChunkedForest.chunkField](../../src/feature-libraries/chunked-forest/chunkedForest.ts) uses a policy derived from the forest's current schema.
The [forest interface contract](../../src/core/forest/forest.ts) requires content passed to this method to match that schema.

For example, suppose `U` adds a `Comment` node type that does not exist in `S`.
The application applies the local upgrade, then inserts a `Comment`.
If insertion preparation uses the forest's old-schema chunker, the chunker can request the shape of `Comment` from `S`.
The [shape lookup](../../src/feature-libraries/chunked-forest/chunkTree.ts) fails when the type is missing.
An existing type's permitted shape can also change between `S` and `U`, so handling missing types alone is not sufficient.

Option A needs a preparation path that does not assume the destination forest has already been upgraded.
Two approaches are plausible:

| Approach | Required changes and trade-offs |
| --- | --- |
| Schema-independent chunking for pending insertions | Route preparation through the existing general chunking helper with a schema-independent policy instead of the old-schema forest method. This avoids a separate schema cache, but can reduce chunking efficiency for those insertions. |
| Schema-based chunking using `U` | Reuse the chunking implementation with a separate chunker scoped to the effective schema. Manage its cache invalidation and cleanup. This retains schema-based optimization but adds lifecycle work. |

A [schema-independent policy already exists](../../src/feature-libraries/chunked-forest/chunkTree.ts).
The [reference forest uses it](../../src/feature-libraries/object-forest/objectForest.ts).
Evaluate that path before adding another optimized chunker.
Keep insertion validation against `U`; schema-independent chunking is not a reason to skip validation.

Neither approach inherently requires:

- A new chunk format.
- Rewriting existing forest content.
- Changes to anchors or delta operations.
- A new persisted format.

Keep the destination forest's schema and authoritative chunker bound to `S` until the combined change is applied.
Use the alternate preparation path only where needed to construct the new edit.
[TreeCheckout.applyInternalChange](../../src/shared-tree/treeCheckout.ts) applies subchanges in order, so the schema prefix installs `U` before the content edit reaches the forest.
The existing chunker responds to the schema-change notification by invalidating its shape cache.

Options B and C avoid this specific ordering problem:

- Option B applies the schema upgrade inside the internal transaction before preparing insertion chunks.
- Option C prepares edits on a private checkout whose stored schema is already upgraded.

Their normal forest chunkers can therefore use `U` without this separate preparation path.
They still need their transaction, refresh, and recovery mechanisms.

Correct chunk preparation is required for Option A; a separate optimized chunker is optional.
Test new node types and changed shapes of existing types with the optimized and debug forests, not only the reference forest.
Measure the cost of the selected preparation path.

### Transactions

A normal single edit needs no additional transaction frame.
The compound change itself carries the upgrade and data.
An existing transaction can compose it with later edits.

Application-requested preconditions can themselves produce the first triggering change.
Route those changes through the same hook.
Explicit schema edits can also create multiple data groups.
Do not assume that every resulting transaction has exactly two subchanges.
Preserve constraint semantics and post-processing order.

[The current minimizer wrapper](../../src/shared-tree/transactionMinimize.ts) rejects multiple data groups.
Test this interaction and define supported processing before using an automatic upgrade inside such a transaction.
Do not silently remove the user's post-processor.

### Option A advantages

- Observes generated application changes at a shared authoring boundary.
- Produces a single commit without adding a transaction frame for each first edit.
- Keeps schema upgrade order explicit in the changeset.
- Reuses existing schema/data encoding and transaction rollback.
- Naturally preserves existing paths that return without generating a change.

### Option A disadvantages

- Requires content preparation with a schema that is not yet stored.
- Requires a new local-authoring hook and careful ownership across transaction branches.
- Does not automatically cover merge, serialized replay, or history APIs that bypass the editor.
- Still requires the undo and concurrency decisions in Section 7.

## 6. Option B: upgrade inside an internal edit transaction

This is a retained single-commit alternative, not the selected C2 strategy.
Its internal transaction combines the automatic schema upgrade and application edit; selected C2 keeps those commits separate.

### Option B design

Wrap an application mutation that can produce the first local change in an internal transaction.
Within that transaction, apply the schema upgrade before executing the mutation.
Commit both changes together if the mutation generates a change.
Do not classify the change by its effect on content.

```text
validate mutation
start internal transaction
  apply schema upgrade
  execute mutation once against upgraded schema
  observe whether it generates an application change
commit both changes, or abort internal preparation if no change was generated
```

If an application transaction is already active, use a nested internal frame.
An outer abort must remove both changes.
An edit failure must not leave a committed schema-only upgrade.

The wrapper must execute the mutation once.
Track whether the normal edit pipeline generates an application change; exclude the wrapper's own schema change.
A generated change qualifies even if it leaves document content unchanged.
Do not invoke an application setter or callback twice.
Perform validation before mutation where possible, and roll back internal preparation if later validation fails.

Place the common wrapper before schema-dependent chunk preparation.
Acquire the active field editor after the transaction starts.
An editor captured before the start can still reference the previous branch.

### Calls that generate no change

A mutation method can return without generating a change.
If the wrapper has already applied a schema prefix internally, abort that preparation rather than publish a schema-only commit.
Keep the locally upgraded view usable and preserve its node references.

This check only asks whether an application change was generated.
It does not require delta inspection, content comparison, or early classification of mutation plans.
The internal transaction and event handling must distinguish the wrapper's schema prefix from the application change.
Application-requested constraint changes must use the same trigger as content changes.

### Option B advantages

- Reuses the existing schema editor and transaction rollback paths.
- The real stored schema is upgraded before content is chunked.
- Can reuse the forest's normal chunker after that upgrade.
- Closely matches an application that explicitly groups an upgrade and an edit in a transaction.

### Option B disadvantages

- Must distinguish generated application changes from its own internal schema preparation.
- Adds internal transaction frames and associated event, label, and metadata concerns.
- Requires every relevant mutation entry point to use the wrapper.
- Requires special care when an edit fails after schema application.
- Does not avoid context-lifetime, undo, or concurrency work.

### Comparison

| Concern | Option A | Option B |
| --- | --- | --- |
| Trigger observation | Observe a generated application change | Track application changes generated inside the wrapper |
| Schema-dependent content preparation | Requires a separate effective-schema path | Uses the upgraded document schema |
| Atomicity | One compound change | Existing transaction squash |
| Extra transaction frame | Not required for a normal edit | Required |
| Risk of missing an entry point | Authoring paths outside the editor | Mutation paths outside the wrapper |
| Main implementation risk | Schema separation during preparation | Transaction lifecycle and rollback of internal preparation |

The broader trigger removes effect detection as a reason to prefer Option A over Option B.
Compare the cost of effective-schema content preparation in Option A with transaction and event handling in Option B.
Neither option needs semantic filtering.
Given the planned schema-rebase support, prefer Option C below for the long-term design.
Keep this comparison available if Option C's permanent integration work proves more costly than expected.

### Option C: use an internal local branch

Proceed first with C2, the persistent-branch variant of this option, and validate the requirements below.
An explicit local upgrade call makes a private branch a natural representation of the requested state.
The private checkout can use its real stored schema for reads, field editing, validation, and chunk preparation.
The confirmed planned scope includes:

- Schema changes rebased over data changes.
- Data changes rebased over schema changes.
- Concurrent schema changes.
- Mixed schema/data changesets, including application-authored transactions and histories that span schema and data changes.

Plan to use the standard rebase implementation for all of these cases when that work is available.
Until then, any early implementation must distinguish the cases covered by each temporary workaround.
The integration checks below verify the completed work in this feature; they are not open questions about its planned scope.
Correct handling still includes detecting genuine conflicts and enforcing application constraints.

#### Target flow after schema-rebase support

1. The application calls `upgradeSchema()` in deferred mode.
2. Create an internal, non-shared checkout from the main checkout.
3. Apply the schema upgrade on this private checkout and expose its view.
   Do not submit its schema commit.
4. As the main checkout receives remote data or schema changes, rebase the private checkout with the standard schema/data rebase implementation.
   Preserve the local upgrade and application edits according to the conflict rules.
   Expose only a consistent view, and keep remote schema changes subject to compatibility checks.
   If the received shared schema makes the document viewable as-is, cancel the pending upgrade and transition to normal editing instead.
5. After the first application-originated change commits, select the still-needed private schema commit followed by the application commit.
   Preserve existing multi-commit application history when an operation such as merge brings in several commits.
6. Publish that ordered sequence to the base without compacting it or assigning one revision to the whole sequence.
   Retain the source history and record each member's submission and outcome.
7. Continue editing through the same synchronized view branch without invalidating existing node references.
   Retire obsolete upgrade-specific state, but retain outcome tracking until publication is resolved.
   C1 handoff remains a documented alternative, not a requirement for C2.

The same design should apply to a selected shared branch, not only the branch named `main`.
Do not hold a transaction open for the entire read-only period.
Current checkout APIs prohibit rebasing or merging a checkout with a pending transaction.
An open transaction also defers remote changes instead of keeping the view current.
Full schema/data rebase support does not, by itself, change those transaction restrictions.

Updating the private checkout remains this feature's responsibility.
A fork does not automatically follow its parent.
The new rebase support should simplify that update operation, not remove the need to schedule it.

#### Branch lifetime choices

The base branch handles shared history, incoming ops, submission, and summaries.
The view branch holds the state exposed to application code.
The comparison below records the selected C2 path and the C1 alternative:

| Choice | After local publication or a sufficient remote schema change | Advantages | Costs |
| --- | --- | --- | --- |
| C1: temporary view branch, alternative | Transfer editing to the base checkout and release the private branch when outstanding work permits. | Avoids continued branch synchronization and duplicate checkout state after the transition. | Needs a safe handoff that preserves nodes, subscriptions, transaction state, history, and outcomes. |
| C2: persistent view branch, selected | Keep the application attached to the same view checkout. Continue publishing local changes to the base and rebasing the view over base changes. | Avoids the handoff and uses one view ownership model before and after the upgrade. | Keeps synchronization, resource management, and outcome forwarding active for the lifetime of the view. |

Both choices must end obsolete schema-upgrade work.
Neither may attach the same upgrade repeatedly to later edits.
In C2, only the deferral-specific state changes when the upgrade is no longer needed; the branch can stay.
Submission is not the same as acceptance, so retain required outcome and recovery tracking for any attempt still in flight.

Proceed with C2 first and measure its synchronization and retention costs.
Revisit C1 only if the C2 implementation exposes a concrete reason to change direction.
Keeping a branch does not mean retaining every commit forever, or keeping a transaction open forever.

#### Persistent view branch: synchronization requirements

Use the following directions:

```text
application change -> view branch -> publish or merge committed changes -> base branch -> runtime
runtime changes -> base branch -> rebase view branch -> application notifications
```

This is not blind event mirroring.
The synchronization must preserve the identity and origin of each logical edit.

1. Apply application edits immediately to the view branch.
   Publish them to the base at the normal commit boundary.
   Do not add an extra user action or silently change batching and submission timing.
2. Keep transaction work private until the enclosing transaction commits.
   An application abort must not publish that work.
   Respect the existing restrictions on rebasing or merging checkouts with open transactions.
3. Publish the pending schema commit before the committed application data.
   Do not confuse one merge event, one runtime batch, and one SharedTree transaction.
   Use an explicit runtime batch when its non-interleaving or rollback guarantees are needed.
4. Rebase the view onto the updated base after remote changes, local publication, and sequencing reconciliation.
   Do not rebase the shared base onto the private view.
5. Recognize local edits already published to the base.
   A resulting base event or acknowledgement must not cause another publication, duplicate application, or a duplicate logical change notification.
   Remote changes and internal rebase changes must not become new application edits.
6. Preserve commit identity across normal merge/rebase.
   Keep the existing schema and data revisions on the initial publication path; no compaction mapping is needed.
   Track which commits have already been published so a later merge cannot publish them again.
   Recovery can require new attempt revisions and must map those explicitly.
   Do not rewrite an already published revision to mean something different.
7. Map base-branch outcomes to the logical edits observed through the view.
   Preserve labels, custom metadata, undo/redo behavior, and error handling.
   Updating the base must not mean that an application edit is already accepted.
8. Schedule synchronization at safe internal boundaries, outside edit-locked application callbacks.
   Coalesce redundant work and prevent reentrant merge/rebase loops.
   Do not implement this by blindly calling merge from every `changed` listener.

Rebase and merge are existing building blocks, not a complete synchronization controller.
For example, `merge(view, false)` can keep a checkout alive, but does not automatically propagate later edits or update the source checkout after the base changes.

If publication is rejected, retain the original and dependent work before reconciliation can discard it.
The persistent branch may help retain that work, but it is not sufficient if it is also the only branch subjected to a lossy rebase.
The retry-or-fail-stop contract remains unchanged.

#### Persistent view branch: resource lifetime

Keep the view's forest, anchors, and subscriptions stable while the view remains active.
Advance its history base as synchronization progresses so that an old divergence point does not retain unrelated history indefinitely.
Respect history needed by transactions, revertibles, unpublished changes, and recovery.
The existing [EditManager branch tracking](../../src/shared-tree-core/editManager.ts) responds to rebase and disposal; use it rather than inventing separate history-trimming rules.

Shared summaries and ops must continue to come from the base, not from unpublished private state.
Dispose synchronization listeners and private resources when the view is disposed.
Do not dispose the shared base as a side effect.
Do not lose edits already submitted but still awaiting an outcome when releasing view-owned resources.

Measure the extra forest state, history retention, and synchronization cost over long sessions.
Correctness requires a stable lifetime and bounded unnecessary retention, not removal of the branch after the first edit.

#### Temporary work versus permanent responsibilities

| Concern | Needed with the current rebase limitation | Needed after the planned support |
| --- | --- | --- |
| Retain a private schema upgrade across ordinary remote data edits | A special schema-only refresh must discard or replace the private upgrade and recreate it on the new base. | Use normal branch rebase, provided the integration checks pass. Remove the special reconstruction path for this case. |
| Hide temporary downgrade/re-upgrade during that refresh | Suppress intermediate incompatibility and avoid disposing nodes while the workaround rebuilds schema state. | The workaround-specific transition goes away. Still verify that rebase's view update preserves valid nodes and exposes no intermediate state. |
| Retain application data across a schema change | Retain the original work before lossy rebase. Reconstruct a safe attempt where possible, or fail-stop. Never use schema-only refresh to discard application work. | Use standard data-over-schema rebase. Keep recovery for genuine conflicts and failures, not for the mere presence of schema changes. |
| Reconcile concurrent schema upgrades | First check whether the received schema is viewable as-is. If so, cancel the pending upgrade and return to normal behavior. Otherwise recompute the target, retaining application work for safe recovery. | Apply the same exit rule with standard schema-over-schema rebase. Viewability is sufficient; equivalence to the local target is not required. |
| Rebase separate schema/data commits and mixed application history | Retain the original work and provide one coordinated safe retry, or fail-stop. Current rejection of a schema can also drop its following data commits. | Use standard rebase with explicit dependency/outcome handling. Remove recovery transformations used only to bypass blanket rejection. |
| Create and own the private checkout | Required. | Still required, either temporarily in C1 or for the view lifetime in C2, including cleanup, history retention, and separation from shared summaries. |
| Follow remote changes | Schedule a special refresh or a safe reconciliation operation. | Still schedule updates, but use ordinary rebase for the supported cases. |
| Publish an earlier schema commit with the first application change | Submit separate commits in schema-before-data order after the application transaction succeeds. Retain a record of both outcomes. | The same ordered publication remains; no history compaction is required for it. |
| Preserve local upgrade after application abort | Keep local authorization and upgraded view while discarding cancelled application work. | Still required. |
| Handle open, nested, and asynchronous transactions | Respect transaction boundaries and retain dependent work. | Still required. Rebase support is not transaction-lifecycle support. |
| Preserve nodes, anchors, and subscriptions | Required during refresh and ownership changes. | Still required during successful rebase and publication. The amount of new code depends on view-update behavior. |
| Route edits after publication | Either transfer ownership in C1 or keep publishing from and rebasing the persistent view branch in C2. | Still required. C2 avoids a handoff but retains ongoing synchronization. |
| End deferral after a sufficient remote schema change | Cancel the pending upgrade and preserve application and in-flight work. The view branch may remain active. | Still required. Remove deferral-specific state, not necessarily the branch or its synchronization. |
| Undo, labels, metadata, commit identity, and outcomes | Preserve the data commit's native behavior and correlate its outcome with the schema commit for recovery. | Still required; no mixed-commit data-only projection is needed for the automatic upgrade. |
| Mixed-version collaboration | Follow current replicated semantics and compatibility gates. A local workaround cannot change another client's interpretation. | Follow the completed rebase work's deployment gates and verify supported clients agree on the new semantics. |
| Trigger rules and public view behavior | No publication for reads or internal work; no new public status. | Unchanged. |

The local upgrade and subsequent application changes can remain normal branch history instead of needing special treatment whenever a schema change is involved.
This removes the schema-reconstruction path and recovery transformations needed only because of the current blanket rejection.
It also removes much of the associated temporary event suppression.
It does not eliminate the state needed to distinguish local upgrade, publication, and accepted outcome.

#### Confirmed current behavior

These results describe the current implementation, not the planned one.
Focused checks with two clients and the optimized forest established the following:

| Operation | Current result |
| --- | --- |
| Upgrade a private fork | Its view becomes readable; the main schema and head are unchanged; no op is queued. |
| Rebase that fork over a remote data edit | Rebase completes, but the private schema change becomes empty. The newer view loses compatibility. |
| Rebase after a private upgrade and content edit | The local content edit can also be dropped. |
| Rebase over a remote upgrade to the same schema | The fork adopts the remote schema and can remain viewable without another upgrade. |
| Merge separate schema and content commits without divergence | Both are appended as separate commits. Merge does not squash them. |
| Merge a single transaction commit containing schema and data | One compound commit is appended. |
| Rebase a private checkout with an open transaction | The checkout rejects the operation. |

Thus, **a branch can contain local schema-change commits, but ordinary rebase does not preserve those changes across remote content edits**.
There is no special exemption for an unpublished schema change.
The current [schema change rebaser](../../src/shared-tree/sharedTreeChangeFamily.ts) treats it like any other schema change.

#### Temporary workaround cases

The following workarounds apply only until the corresponding rebase behavior is available in the supported deployment.
They must not become a second permanent rebase implementation.

| Case | Example in Option C | Temporary handling | Removal condition |
| --- | --- | --- | --- |
| Local schema over remote data, with no application changes | A read-only view has a private upgrade; another client edits existing content. | Refresh from the main branch and recreate the permitted private upgrade. | Standard schema-over-data rebase retains the upgrade and produces a correct view update. |
| Concurrent schemas, with no application changes | Another client applies the same upgrade or a different schema expansion. | If the received schema is viewable as-is, discard the pending private upgrade and end deferral. Otherwise refresh and recompute a permitted target or report genuine incompatibility. | Standard schema-over-schema rebase replaces reconstruction; the viewability-based exit rule remains. |
| Application data over a schema change | User edits on the private branch encounter a remote schema change or schema transitions during history reconciliation. | Retain data and its base before rebase. Retry only after a safe transformation that preserves intent and constraints; otherwise fail-stop. | Standard data-over-schema rebase handles valid edits without blanket rejection. |
| Schema/data history over remote changes | The ordered publication is rebased before acceptance, or an application transaction spans schema and data changes. | Retain the whole logical operation and dependent work. Rebuild one valid ordered retry when possible; do not replay accepted members. Otherwise fail-stop. | Standard rebase handles the history and application-authored mixed changes, with explicit tests for partial outcomes and dependency handling. |
| Concurrent schemas with application changes already present | The private branch has edits that depend on its upgrade when another upgrade arrives. | Combine schema reconciliation with recovery of the dependent edits. Do not use the schema-only discard-and-refresh path. | Standard schema/schema and mixed-change paths handle the complete history; genuine conflicts still use the permanent recovery contract. |

These are overlapping cases, not independent code paths that must each be implemented.
A mixed history can require several of them during one rebase.
Removing one workaround is safe only when every relevant direction and change shape on that path is supported.

#### Temporary workaround: refresh before the first application change

This workaround addresses the first two rows: schema-over-data and schema-over-schema updates before any application-originated change.
It is needed only if the feature ships before those rebase cases are supported.
Do not make it the normal long-term design.

Before any application-originated change, the private branch contains only known internal schema work.
It is reasonable to discard or replace that private schema work when the document advances.
Then compute a fresh target against the new document schema.
This is local state maintenance, not a retry of a submitted user edit.

A possible refresh operation would:

1. Capture the new main-branch state.
2. Adopt its content and schema.
3. Check ordinary view compatibility against the received shared schema.
4. If the document is viewable as-is, discard the pending upgrade and return to normal behavior without recreating it.
5. Otherwise, recompute the pending target under the original application authorization and apply it privately if permitted.
6. Otherwise, perform internal reconciliation or use the existing incompatibility/error behavior when necessary.
   Do not expose a pending-upgrade recovery state.

Do not expose the temporary old-schema state between steps.
An ordinary `rebaseOnto` followed by `upgradeSchema` can restore readability, as the probe confirms.
It does not meet the full design contract: current schema events dispose node wrappers during the transition.
The implementation needs a consistent refresh operation that preserves valid nodes and coalesces events.

Refresh at most once for each captured main-branch state, and coalesce incoming updates where useful.
Do not loop until a schema change survives rebase.
Once the private branch contains an application-originated change, including a constraint-only change, do not discard and rebuild it under this schema-only rule.
Preserve that work for the approved reconciliation or recovery path.

This strategy can avoid changing replicated rebase semantics during the read-only period.
It does not remove the conflict risk after the ordered schema/data commits are submitted.
It is not sufficient by itself to ship the feature: once application changes exist, the full retry-or-fail-stop contract applies.

#### Temporary workaround: recover application work before full rebase support

This workaround addresses data-over-schema changes, ordered publication history, mixed application transactions, and concurrent upgrades with dependent application edits.
It must retain the original schema intent, user changes, and their base before invoking the current lossy rebase.
Use the safe retry requirements in Section 7 to construct a new valid attempt when possible.
Do not treat recreating the schema upgrade as recovery of the user edits.

If the remote schema makes the document viewable as-is, end deferral and recover the retained application work without another deferred schema upgrade.
If deferral is still required, the new attempt must include any still-needed permitted upgrade and correctly transformed application changes.
An equivalent schema alone does not prove that stale paths, identifiers, or application constraints are still valid.
If safe reconstruction is not possible, fail-stop.

The full planned rebase support should replace transformations whose only purpose is to work around blanket rejection of schema/data combinations.
It does not remove protection against duplicate attempts, loss of dependent work, genuine constraint failures, or unbounded recovery.
Keep those permanent safeguards.

#### Selected publication: ordered schema and data commits

Keep the private schema upgrade and the first application change as separate commits.
For the common case, the history is `base -> schema -> data`.
The data commit can be the result of squashing an application transaction; do not move the earlier schema commit into that transaction.
An application merge can bring several data commits, which must retain their order and existing transaction boundaries.

[SharedTreeBranch.merge](../../src/shared-tree-core/branch.ts) preserves these commits, and [SharedTreeCore](../../src/shared-tree-core/sharedTreeCore.ts) submits them in order.
The loader assigns client sequence numbers and delivers sequenced ops in order.
[Runtime grouped batches](../../../../runtime/runtime-definitions/src/protocol.ts) additionally prevent interleaving.
Use an explicit, supported runtime batching boundary if the publication path needs non-interleaving or batch rollback.
Do not assume that a merge callback alone establishes that boundary.

Wait for successful completion of the application transaction before publishing either member.
Retain both commits and dependent work before submission.
Handle synchronous failure between submissions explicitly: roll back a still-unflushed publication scope where supported, or fail-stop without claiming success.
Do not assume an already submitted or accepted schema can be retracted.
The exact runtime-boundary wiring and fault tests are M4 work.

This is coordinated publication, not one all-or-nothing accepted change.
Schema can become visible before a separate data message, and an accepted schema remains if later data fails.
That is compatible with the requirement that undo or rejection of data must not downgrade a schema already in use.
It is distinct from an application abort before publication, which sends neither commit.

Preserving the initial revisions avoids the normalization-related node replacement observed in the single-commit investigation.
The data commit can retain its native revertible.
No compaction or new wire format is required for this normal publication path.
Recovery can still require explicit revision mapping when rejected work is reconstructed.

Keep the same C2 view checkout after publication.
Using `disposeMerged: false` preserves it but does not make later edits submit automatically.
Continue synchronization, outcome tracking, and resource management without duplicating application notifications.

#### Separate outcomes and the dependency contract

Record schema and data outcomes separately within one logical publication attempt.
The current rebaser drops following data when a preceding local schema loses: later changes rebase over the inverse of that schema.
Tests confirmed this for separate delivery, bunched delivery, equivalent remote upgrades, and reconnect.
This behavior is a temporary safety property, not a protocol-level transaction guarantee.

If the schema fails, reconcile the entire affected suffix and establish each member's actual outcome before retrying.
No data that requires the rejected schema may remain applied against an incompatible document schema.
Retain all affected application work; the current cascade does not preserve it for us.
When full rebase support changes this behavior, test partial outcomes explicitly rather than assuming every following edit is still dropped.

If schema succeeds but data fails, keep the schema and recover only the failed work when safe.
If a remote schema is sufficient, cancel the pending upgrade and recover data without another schema commit.
Never replay an accepted member.
Use the same single retry allowance for the logical operation, not one allowance for each commit.

Runtime rollback is a separate path.
The runtime rolls a queued batch back in reverse order, so data is removed before schema when both are in scope.
SharedTree's rollback method requires the target commit to be the latest one; it does not independently cancel arbitrary later commits.
A service NACK initiates transport recovery or closure, not schema-aware rollback.

#### Permanent requirement: preserve the view through successful rebase

Successful rebase must preserve application-visible node references where the nodes remain valid.
This is a separate requirement from preserving the schema commit in branch history.

The current [branch rebase algorithm](../../src/core/rebase/utils.ts) constructs a view update from rollback inverses, target changes, and rebased source changes.
Even if the final schema remains `U`, that update can contain schema transitions.
[SchematizingSimpleTreeView.update](../../src/shared-tree/schematizingTreeView.ts) currently replaces its context on a schema-change notification.

The planned rebase work might simplify or eliminate those intermediate schema transitions.
Confirm that through tests rather than assume it.
If transitions remain, this feature still needs context reuse or consistent event handling that preserves the upgraded view.
The temporary refresh workaround can be deleted without deleting this public lifetime guarantee.

#### Integration checks for the planned rebase support

Validate the following when integrating the confirmed full rebase support:

1. A private schema upgrade rebases over ordinary remote data edits without being dropped, and the final content and schema remain valid.
2. A private history containing the upgrade followed by application changes rebases correctly.
   A successful test of an isolated schema-only change is not sufficient.
3. Ordered schema/data publication preserves order, identity, and dependency handling through sequencing, rebase, reconnect, and resubmit.
   Also retain support for application-authored transactions that contain mixed schema/data changes.
4. Data-over-schema and concurrent schema changes work through the actual branch reconciliation path, including its rollback inverses.
   Verify that genuine conflicts and violated constraints produce the defined outcomes rather than silent loss.
5. A remote schema that makes the document viewable as-is ends deferral without publication or loss of local work.
   Include schemas that are viewable but not equivalent to `U`, including cases where `canUpgrade` is false.
6. The view receives consistent updates without invalidating unaffected nodes or reporting temporary loss of compatibility.
7. All participating supported client versions agree on the rebase semantics.
   Follow the rebase work's compatibility gates; do not enable new semantics only on the client using deferred upgrades.
8. For C2, repeated local publications and incoming base updates converge without duplicate edits or notifications.
   Include both initial commit acknowledgements, later transactions, and a sufficient remote schema change that cancels deferral.

The schema/data combinations above are in the confirmed planned scope.
View lifetime, ordered publication, transaction behavior, and compatibility gating remain integration responsibilities even when the underlying rebaser is correct.
If delivery is incremental, keep each workaround until its relevant cases pass these checks on the supported deployment.
Do not confuse an incomplete delivery stage with a gap in the planned scope.

#### Delivery strategy and removal of temporary code

**Agreed planning assumption:** early delivery is likely needed.
Build the permanent C2 infrastructure and include temporary handling for the rebase cases that are not yet available.
Do not require the feature to wait for the full rebase work, but do require the interim implementation to meet all agreed invariants.
Use the one-retry policy below for a rejected or synchronization-rolled-back publication.
Then remove temporary transformations as the standard rebase implementation becomes available.

For the early-delivery path:

- Keep temporary schema-only refresh and special retry transformations separate from permanent branch ownership, publication, and transaction logic.
- Select the required workarounds through internal capability/configuration handling, not a new public status or recovery API.
- Retain user work before any lossy rebase.
  Supply one safe retry for a failed initial publication and fail-stop if recovery is unsafe or that retry fails.
- Test the temporary path and the supported-rebase path against the same public contract.
- Remove each temporary workaround when the supported deployment baseline covers its relevant schema/data cases.
  Remove refresh-specific downgrade/re-upgrade handling and retry transformations that merely bypassed blanket rejection.
  Keep regression tests for ordinary rebase, node lifetime, ordered publication, and remaining recovery cases.

Do not build an unrestricted alternative schema rebaser inside the deferred-upgrade implementation.
That would duplicate the scheduled work and retain the maintenance cost this option is intended to avoid.
Replace workarounds only when the required behavior and collaboration compatibility are available and verified.
A schedule estimate alone must not enable the new path.

#### Option C advantages

- Closely matches the explicit local upgrade flow.
- Reuses a real upgraded stored schema for field interpretation, validation, and chunking.
- Keeps pending work separate from shared history and summaries.
- Can reuse existing fork, delta, and transaction mechanisms.
- After the planned support, schema-over-data, data-over-schema, schema-over-schema, and mixed histories use the standard rebase paths.
- Avoids Option A's separate effective-schema chunk preparation and Option B's schema-preparation transaction wrapper.
- C2 can keep one stable view checkout indefinitely, avoiding an ownership handoff when deferral ends.
- Separate schema/data commits avoid initial history compaction and let the data use native undo.
- Temporary refresh and recovery transformations can be isolated and removed if an early release needs them.

#### Option C disadvantages

- Depends on the planned rebase support for its simplest implementation; an earlier release adds temporary refresh and recovery work.
- Needs ordered publication after the application transaction succeeds, including handling partial submission and separate outcomes.
- Needs either a safe ownership handoff in C1 or reliable ongoing synchronization in C2.
- Adds a checkout, subscriptions, and retained branch history; C2 keeps these for the view lifetime.
- Must release or advance private history without losing user work or recovery information.
- Does not by itself solve undo or every conflict case after publication.

Prefer this option for the long term because it can reuse normal branch semantics and one authoritative schema per checkout.
Validate the permanent costs with a focused prototype rather than judge the option mainly by temporary workarounds.
The decisive tests are live remote editing without node invalidation, ordered publication after an earlier upgrade call, native data-only undo, reliable editing after deferral ends, and safe retry or fatal failure for remaining rejection cases.
For C2, also test long-running bidirectional synchronization and history retention.

### Approaches not recommended

**Change the shared checkout's stored schema and delay only its op.**
This makes document state, summaries, and change encoding disagree with replicated history.
Do not use this approach.
This is different from Option C, where the upgrade is a real change on a separate private branch.

**Call `upgradeSchema()` from `changed`, `beforeBatch`, or an insertion validator.**
Event hooks are too late or prohibit edits.
A validator can run for a rejected mutation or a call that generates no change.
Such calls also risk disposing nodes while they are in use.

## 7. Required decisions and cross-cutting behavior

### Undo is different from transaction abort

An application abort cancels its private data changes before either publication commit is submitted.
Keep the earlier application-authorized local schema upgrade available after the abort.
If the runtime rolls back an unflushed pair, remove data before schema and preserve or restore the local upgraded view through the controller.

User undo after a successful commit is different.
Another client can already depend on the expanded schema.
The user must be able to undo the data change without reverting the schema upgrade.
This is an agreed invariant, not an optional follow-up.

Required behavior:

- Preserve the native revertible for the separate application data commit.
- Retain the expanded schema on user undo.
- Preserve the application's data-transaction undo grouping; do not include the earlier automatic schema commit.
- Rebase the data inverse from the correct commit context.
- Preserve labels, undo/redo kinds, constraints, and repair-data retention.

The selected path does not need to extract a data-only inverse from a combined automatic-upgrade commit.
Do not remove the `hasSchemaChange` guard or change existing rules for arbitrary application-authored mixed transactions.
Keep history traversal and `revertTo` consistent with their existing schema boundaries.
Retry integration must preserve or translate data revertibles when rejected data receives a new revision.
Blocking undo for the first edit is not an acceptable fallback.

### Concurrency and asynchronous transactions

With the current rebase rule, a concurrent edit can cause the automatic upgrade and the triggering application change to be dropped together.
An unrelated data edit is sufficient.
This is particularly important for asynchronous transactions and long-lived branches.

The team has scheduled full schema/data rebase support, including both directions, concurrent schema changes, and mixed changesets.
Use that work as the preferred long-term basis for Option C.
There are two implementation paths depending on when the feature ships relative to that work:

1. Preserve the existing replicated conflict rules and add internal reconciliation.
   Retain rejected work, retry it safely when possible, and fail-stop when recovery cannot succeed safely.
   Do not require the application to implement schema-publication recovery.
   This direction needs a concrete, bounded algorithm before it is viable.
2. Integrate the scheduled schema-rebase support.
   Verify the schema-only, mixed-change, and view-update cases listed under Option C.
   Treat changes to replicated semantics as part of that compatibility-sensitive workstream, not a private feature shortcut.

Reporting a dropped commit through the existing settled outcome is not, by itself, a solution.
Neither is adding a public recovery-required state.
Do not claim that the first edit is guaranteed to survive concurrency with the current implementation.
Resolve this limitation before shipping the feature, even as an opt-in.
When the new rebase support removes blanket rejection of schema/data combinations, remove recovery transformations needed only to bypass that limitation.
Retain the retry-or-fail-stop contract for genuine conflicts, violated constraints, and other failures.
Do not keep rebuilding schema changes in the normal path once the standard rebaser supports them.

Do not change rebase semantics only on the client that enables deferral.
Old and new clients must reach the same result for the same ops.
Any change to those semantics needs compatibility gating and mixed-version tests.
The existing wire shape alone does not make such a change compatible.

If a remote client changes the schema, first check whether the received schema is viewable as-is.
If it is, end deferred-upgrade management and return to normal behavior.
Do not send the pending upgrade, even when the received schema differs from the local target.
Only recompute a pending target when deferral remains necessary.
If a remote change makes the view incompatible, use the existing invalidation behavior.
Remote activity alone must not initiate publication when the application has not made a triggering edit.
A confirmed rejection of an already attempted application change can initiate the internal retry path.
That retry must satisfy the requirements below.

### Retry rejected edits or fail-stop

Use separate internal states for local upgrade authorization, publication, and failure.
Do not expose these states as new application statuses.
The required result for rejected publication is safe recovery or an explicit fatal failure, not silent loss followed by continued editing.

Required internal transitions are:

| Event | Required response |
| --- | --- |
| Application aborts the triggering transaction | Keep the locally upgraded view; retain pending publication only if deferral has not already ended. Do not retry cancelled work. |
| Remote schema makes the document viewable as-is | Adopt normal behavior, cancel the unpublished upgrade, and stop deferred management. Preserve application work and outstanding outcome tracking. |
| Initial submitted upgrade/edit is rejected or rolled back by synchronization | Retain the original and dependent work. Make one safe retry; otherwise fail-stop. |
| Schema accepted, data rejected | Keep the accepted schema. Reconcile the failed data and its constraints; retry only that work when safe. |
| Only one member's outcome is known | Keep per-member tracking; do not assume joint acceptance or replay a member whose outcome remains uncertain. |
| Retry is rejected or rolled back, or cannot preserve intent or constraints | Fail-stop; no second retry and no continued editing with missing user work. |
| Remote schema makes reads unsafe | Invalidate access. If it also prevents recovery of a rejected edit, fail-stop. |
| Unexpected internal failure | Follow the existing explicit error and broken-state rules. |

Reads can continue during internal reconciliation only when the locally presented schema permits them.
Do not keep displaying failed content as if it were shared successfully.
The application must not need to inspect schema-publication state or request a schema retry.

#### Initial recovery policy: one retry

The initial implementation allows one retry after a rejected or synchronization-rolled-back upgrade/edit publication.
This means at most two application attempts for the same logical operation: the initial attempt and one retry.
Each attempt can contain a schema commit followed by one or more application commits.
The allowance counts attempts, not ops, acknowledgements, or individual failed members.
Fine-tuning this internal policy later is allowed; do not expose a new retry status or configuration to applications.

The retry must preserve the retained user work, its constraints, and any dependent edits.
If a safe retry cannot be constructed, fail-stop immediately rather than submit an unsafe attempt.
If the retry is rejected or rolled back, fail-stop without a third application attempt.

Keep the retry count with the logical publication operation, not with a revision or a pending schema target.
A changed remote schema, a new attempt revision, or later dependent edits must not reset that count.
If a remote upgrade makes the document viewable as-is, use the same remaining retry to recover the user edits without the now-unnecessary schema upgrade.
The publication attempt is accepted only when the required schema state and all associated application commits are resolved successfully.
Schema acceptance alone does not complete the operation.
Normal later edits are not retries of a completed recovery operation.

The following are not new retry attempts:

- Transport resubmission of the same attempt, including normal reconnect handling.
- Waiting for an acknowledgement whose outcome is not yet known.
- Private schema-only refresh before any application publication.

An application-requested transaction abort cancels the work and must not trigger a retry.
A synchronization rollback that requires reconstructing and publishing a new application attempt does use the retry allowance.
Identify which case occurred before acting; a generic rollback notification alone is not enough.
This preserves existing runtime resubmission behavior without allowing it to reset the recovery limit.

#### Retain enough information before rejection

Preserve the original changes and their base before any rebase can replace them with empty changes.
Retain the schema-upgrade intent, original constraints, revisions, required detached content, and dependent local edits.
A separate recovery branch is one possible representation.
Do not run the lossy rebase on the only retained copy of user work.

Keep the data needed for recovery until the logical edit is confirmed accepted or the tree enters fatal failure.
Retention must account for history trimming and repair-data cleanup.
Retaining an empty rejected commit and its outcome is not sufficient to reconstruct the original edit.

#### Safe retry requirements

1. Establish the outcomes of the previous attempt's schema and application commits.
   Do not create a new application attempt merely because an acknowledgement is delayed.
   Never replay an accepted member or assume that a failed schema acknowledgement resolves every later data acknowledgement.
   Reconcile runtime bookkeeping at a safe boundary before retrying; do not publish from a settled callback while later members are still being processed.
   Distinguish cancellation and normal transport handling from a rejection that needs the single recovery retry.
2. Reconcile with the latest shared state and check ordinary view compatibility.
   If the received schema makes the document viewable as-is, end deferral and do not submit another deferred schema upgrade.
   Otherwise, recompute a permitted target for any still-pending upgrade.
3. Transform or reconstruct the retained user changes for that state while preserving their intent and constraints.
   Do not simply rebase the same mixed schema/data change through the rule that already dropped it.
   Do not assume that original indexes or paths still identify the same targets.
4. If this transformation cannot be performed safely, fail-stop.
   Do not remove preconditions or treat partially applied application data as successful merely to make the retry succeed.
   This does not require reverting a separate schema commit that has already been accepted.
5. Submit the single allowed recovery attempt with correct revision and identifier handling.
   Send a still-needed schema upgrade as a separate commit before the failed user changes only while deferral remains active.
   Omit accepted or remotely satisfied schema work.
   Preserve application transaction grouping and keep later dependent edits in order.
6. Await the attempt's accepted outcome.
   If this retry is rejected or rolled back by synchronization, fail-stop.
   Do not generate another recovery attempt.

Retry retained changes, not application callbacks.
Rerunning a transaction callback can repeat effects outside SharedTree.
Map internal attempts to the logical application edit without duplicate application or misleading success notifications.
Revision mapping, commit outcomes, labels, undo, and custom metadata need an explicit design for this mapping.

Branch history continues to expose physical commits and their actual revision IDs.
Retained history can contain both a rejected attempt and its accepted retry, with the same application metadata on each.
Revision-based history operations keep their existing meaning and restrictions.
For example, reverting to an original revision can be prohibited when a retry schema commit lies after it.
Do not hide these commits or reinterpret the revision argument as a logical edit ID.
Change notifications and retained undo handles are correlated to the logical edit instead: recovery does not emit another application-originated change or require a replacement undo handle.
This distinction needs no additional wire or summary metadata.

Separate ordered commits preserve inserted-object identity during normal publication, but recovery needs an additional identity-preserving transition.
Normal reconciliation with fresh retry revisions can replace inserted objects and invalidate application references.
The temporary adapter instead prepares the data-only net change for the existing forest, followed by mappings for detached-content identifiers and native revertibles.
This keeps application objects in place while adopting the retry's commit history.
Changing only the commit revision while retaining old atom identifiers is not a safe substitute: that experiment failed an alias-allocation invariant.
The [implementation progress](./deferred-schema-upgrades-implementation-plan.md#m5-coordinated-recovery-and-retry-only-identity-transition) records the regression and validation.
Normal publication does not use this special transition or combine schema and data commits.

This design needs a policy for edits made after the first submission but before its settled outcome.
Retain them with the failed work if publication is dropped.
Any internal buffering must preserve the public editing contract; it must not require polling a publication status.
Do not discard that dependent work during a branch refresh.
The attempt limit is fixed initially at one retry.
Also bound retained recovery state and work per processing turn.
Those resource limits remain implementation decisions, but exhaustion must cause fatal failure rather than silent discard.
Do not leave the client indefinitely unable to edit or continuously retrying the same failure.

#### Fatal failure contract

When safe recovery is impossible, fail-stop the affected tree and surface a fatal error through the existing broken-state/runtime error mechanisms.
This is the requested crash behavior: the client must not continue normal editing after losing the user's work.
Merely reporting a dropped commit, logging an error, or returning to pending state is insufficient.
The implementation must verify that the failure reaches the host and that the affected tree can no longer be used.

Retained in-memory work is not a guarantee of recovery after a process crash or reload.
Do not claim durable recovery without a separate persistence mechanism.

Normal transport resubmission is not a new application attempt.
Do not confuse it with generating another upgrade/edit commit after a conflict.
Bounded retries alone do not guarantee editing progress under the current schema-conflict rules.
The retry transformation described above is a required design component, not a capability established by the existing branch probes.

### Forks, merge, replay, and other edit paths

Typed `view.fork()` already carries the configuration into the new view.
A fork of a locally upgraded view must also retain the local upgrade authorization and derive its own publication state.
Reading or creating the fork must not upgrade its parent.
Editing the fork can create separate schema and application commits locally.
Merging that history later must retain its schema-before-data order.
Keep application-created branches distinct from the internal branch in Option C.

All existing public editing, branching, replay, and history paths are in scope.
The following paths need implementation coverage:

| Path | Issue to address |
| --- | --- |
| Root/object/array/map/record mutation and moves | Must use the chosen automatic-upgrade path. |
| Application-requested constraints | Count as a trigger if they generate a change that would otherwise be committed. |
| Import followed by insertion | Preparation must use the effective schema; insertion is the trigger. |
| An existing data revertible or `revertTo` | Authors a change without the normal field editor. It can be the first local edit. |
| Application-created forks, rebase, and `rewindTo` | Preserve their existing history and view semantics without exposing the internal C2 branch or restricting use because of pending publication. |
| `applyChange` | Replays a serialized change and currently bypasses transaction squashing. |
| Merge of a branch edited under an older schema | Can change the target without carrying its pending upgrade. |
| Remote processing, load, resubmit, or internal repair | Must not add a view-driven upgrade. |
| Shared branches and independent views | Need the same state rules, without assuming an attached runtime. |

**Agreed scope:** application-originated local changes through the configured view use the same trigger, including changes without content effects.
For history operations, do not rewrite an existing commit under its existing revision to insert a schema change.
The same revision must not mean different changes on different branches.

Merge and serialized replay must route their existing commits through the C2 publication controller.
Precede them with a still-needed private schema commit without rewriting their revisions to combine them.
Respect the current restrictions on merge and replay inside transactions.
Track incoming application history separately from internal synchronization so it is not published twice.

Complete that history design for the initial implementation.
Do not reject an otherwise valid merge, replay, or history operation merely because an upgrade is pending.
Do not silently bypass the upgrade.
Existing restrictions, such as disallowed operations during open transactions, remain in effect.
Supporting all paths does not mean accepting invalid input or guaranteeing success for genuinely conflicting edits.
Such failures still follow the existing contracts and the agreed retry-or-fail-stop behavior.

### Failures and post-processing

Expected input validation failures must occur before document mutation where possible.
They must not leave a submitted schema-only change.
Keep the existing explicit error reporting and broken-state rules for unexpected failures.
Do not catch all failures and report success.

Test transaction preconditions, nested aborts, and post-processors.
If a processor removes the content effects of an application change but the normal pipeline still commits the transaction, retain the schema upgrade.
Do not add a net-effect test or require nonempty content at commit time.
If the application aborts the transaction or the normal authoring pipeline suppresses its commit entirely, do not publish a schema-only replacement.
Do not use this rule to discard a rejected publication; rejection requires the retry-or-fail-stop path.
Internal rollback and reapplication by a post-processor must not start another deferred-upgrade attempt.

## 8. Proposed implementation sequence

1. **Design the remaining implementation details within the agreed scope.**
   Proceed with C2, early delivery, data-only undo, one recovery retry, and support for every existing public operation.
   Define safe reconstruction, logical edit identity, and synchronization/outcome handling.
2. **Define explicit local-upgrade and publication state.**
   Keep the public default unchanged.
   Prove read access for old documents, including live remote data edits.
3. **Prototype the permanent Option C path.**
   Support a root edit, a new optional field, and insertion of a new node type with the optimized forest.
   Preserve references across commit and abort.
   Start with C2: include ordinary rebase, ordered two-commit publication, native data undo, repeated later publications, and remote-schema cancellation of deferral without removing the view branch.
   Measure steady-state synchronization and history retention.
   Keep the other options as references, not required prototypes before proceeding.
4. **Add the branch update and publication paths.**
   Track change origin and transaction lifecycle, without effect classification.
   Cover every typed mutation path.
   Cover normal, nested, and asynchronous transactions.
   Add isolated temporary refresh and recovery transformations only for rebase cases that are not yet available when the feature ships.
5. **Implement data-only undo and all history-operation paths.**
   Do not release with omissions or new restrictions caused by deferral.
6. **Add the alpha opt-in without new public status.**
   Preserve local compatibility semantics and update API contracts, diagnostics, and usage guidance.
7. **Run compatibility, persistence, and multi-client validation.**
   Verify the rebase integration checks and remove temporary code when the supported baseline permits it.
   Only then consider a separate change to the default.

Likely implementation areas across the options:
This is not a list of mandatory changes for Option C.
Its permanent work should concentrate on private-checkout lifetime, synchronization or handoff, transaction integration, publication, and remaining recovery cases.
Existing forest cloning and schema-bound chunk preparation already support a private upgraded checkout.
The separate effective-schema preparation path is an Option A cost, not a permanent Option C requirement.

| Area | Files |
| --- | --- |
| Configuration and API contracts | [configuration.ts](../../src/simple-tree/api/configuration.ts), [tree.ts](../../src/simple-tree/api/tree.ts) |
| Eligibility and staged policy | [schemaCompatibilityTester.ts](../../src/simple-tree/api/schemaCompatibilityTester.ts), [toStoredSchema.ts](../../src/simple-tree/toStoredSchema.ts) |
| Context lifetime and status | [schematizingTreeView.ts](../../src/shared-tree/schematizingTreeView.ts), [context.ts](../../src/feature-libraries/flex-tree/context.ts) |
| Field interpretation and preparation | [lazyNode.ts](../../src/feature-libraries/flex-tree/lazyNode.ts), [lazyField.ts](../../src/feature-libraries/flex-tree/lazyField.ts), [prepareForInsertion.ts](../../src/simple-tree/prepareForInsertion.ts) |
| Edit construction and transaction integration | [treeCheckout.ts](../../src/shared-tree/treeCheckout.ts), [sharedTreeEditBuilder.ts](../../src/shared-tree/sharedTreeEditBuilder.ts), [branch.ts](../../src/shared-tree-core/branch.ts), [transaction.ts](../../src/shared-tree-core/transaction.ts) |
| Chunk preparation | [chunkTree.ts](../../src/feature-libraries/chunked-forest/chunkTree.ts), [mappedEditBuilder.ts](../../src/feature-libraries/default-schema/mappedEditBuilder.ts) |
| Undo and any approved conflict changes | [treeCheckout.ts](../../src/shared-tree/treeCheckout.ts), [sharedTreeChangeFamily.ts](../../src/shared-tree/sharedTreeChangeFamily.ts) |

Reuse existing helpers rather than create a second schema comparison or change-family implementation.
The ordered commits use existing encoded forms.
Do not add compaction or a new transaction-group wire format for the selected path.
Any additional persisted marker or conflict behavior requires a separate format and compatibility assessment.
Generate API reports through the package scripts; do not edit them by hand.
Add a user-facing changeset when the feature is implemented, not for this proposal alone.

## 9. Validation plan

Use the existing [test organization](../../src/test/README.md).
Add focused tests beside the affected source tests.
Use [TestTreeProviderLite and existing helpers](../../src/test/utils.ts) for multi-client scenarios.

### Remote-upgrade scenario matrix

Test all three cases below with a document initially created under schema version 1.
The version numbers label application schema fixtures; the implementation must compare schemas, not version numbers.
In each case, the local client calls `upgradeSchema()` in deferred mode before it receives the remote upgrade.
Verify that this local call enables the view without submitting an upgrade op.

| Case | Local view schema | Incoming remote upgrade | Expected local behavior |
| --- | --- | --- | --- |
| Equivalent upgrade | Version 2 | Version 1 to version 2 | End deferral and return to normal behavior. Never publish the cancelled local upgrade, including on subsequent edits. |
| Insufficient upgrade | Version 3 | Version 1 to version 2 | Keep the local version 3 view usable and publication pending. The next committed application change includes a permitted upgrade from the received version 2 schema to version 3. |
| Upgrade covers more than the local client needs | Version 2 | Version 1 to version 3, compatible with the version 2 view | End deferral and return to normal behavior. Never publish the cancelled version 2 upgrade or attempt to downgrade the shared version 3 schema. |

For the third case, construct a version 2 view that can use the version 3 schema under the normal compatibility rules.
For example, version 3 can add optional fields that the version 2 view permits through `allowUnknownOptionalFields`.
A larger schema is not automatically viewable: it can allow node types or field shapes that the local view cannot read.
Include a separate negative test for such an incompatible expansion.
That test must not end deferral merely because the remote schema has a higher version label.
It must follow the compatibility and retry-or-fail-stop rules without losing application work.

For the equivalent and covering upgrades, assert:

- The compatibility decision uses the received shared schema, not the already-upgraded private schema.
- Deferral-only management and resources are removed when safe; C2 keeps the view branch and ordinary synchronization.
- Existing node references and subscriptions remain usable.
- The first and later application edits reach the shared branch normally without the cancelled schema upgrade.
- An aborted transaction does not restore the cancelled upgrade.
- Exit does not require `isEquivalent` or `canUpgrade` to be true in the covering case.

For the insufficient upgrade, assert:

- Receiving version 2 does not itself cause this client to send an upgrade op.
- The version 3 local view remains usable without another `upgradeSchema()` call.
- The eventual upgrade uses the current version 2 document state as its base, not stale version 1 schema.
- The schema commit precedes the application commit, and neither is submitted before the application transaction succeeds.
- An application-requested abort sends neither and keeps the local upgrade pending for the next committed edit.
- After successful publication, later edits do not add another copy of that upgrade.

Inspect submitted changes as well as local compatibility and final document content.
An internal pending flag alone does not prove that the correct ops were sent or suppressed.

### Required tests

| Scenario | Required result |
| --- | --- |
| Default configuration | Existing compatibility and explicit-upgrade behavior is unchanged. |
| Deferred open before an upgrade call | An upgrade-required view remains inaccessible. |
| Explicit local upgrade, repeated reads, iteration, observation, export, and disposal | No new shared commit or submitted upgrade op; document schema unchanged. Option C may have a private schema commit. |
| Compatibility and schema queries after local upgrade | Match the local results of an immediate upgrade; no public pending-publication status. |
| Publication of an already applied local upgrade | No compatibility transition or schema notification solely because publication occurred. |
| Remote data edits during read-only use | View stays current; this client sends no automatic upgrade. |
| First edit valid under old schema | A separate schema commit precedes the application data commit. |
| First edit uses a new type or field | Validation, chunking, encoding, and remote application succeed. |
| Required-to-optional field/root; supported object-to-map/array upgrades | Read interpretation and first-edit behavior agree with the target schema. |
| Mutation method or empty transaction that generates no application change | No automatic schema publication. |
| Equal-value replacement or generated change with no content effect | Publishes the pending upgrade if the normal pipeline commits the change. |
| Constraint-only transaction | Publishes the pending upgrade if it creates a commit; no publication on abort. |
| Changes that cancel out in a committed transaction | Publishes the pending upgrade without checking the final delta. |
| Internal schema preparation, branch refresh, remote processing, rollback, and transport resubmit | Do not independently initiate publication. Only the controlled recovery path creates a new attempt after rejection. |
| New optional field read before editing | No stale field-kind cache blocks the edit. |
| Cached root/child across first edit | References remain usable; unaffected node identity remains stable. |
| Application-requested outer/inner abort after first edit; later user edit | Publishable data and schema roll back; no retry of cancelled work; the view stays locally upgraded. |
| Invalid mutation | No schema-only commit or op. |
| Asynchronous transaction with remote data/schema edits | Approved conflict behavior; correct final compatibility; no orphan upgrade. |
| Two clients make their first edit concurrently | Safe retry preserves rejected work where possible; otherwise explicit fatal failure, never silent loss. |
| Rejected publication with later dependent local edits | Original and dependent changes are retained before lossy rebase; retry preserves their order and intent. |
| Rejection followed by a remote schema that makes the document viewable as-is | End deferral and safely retry retained user work without the cancelled schema upgrade. |
| Initial publication rejected or rolled back, then retry accepted | Exactly two coordinated application attempts, each with the required ordered members; user work applied once. |
| Retry rejected or rolled back | Fatal error reaches the host and prevents further use; no third application attempt. |
| Safe retry cannot be constructed or would violate original constraints | Fail-stop without submitting an unsafe retry. |
| Schema changes, new revisions, or dependent edits during recovery | Do not reset the one-retry allowance; a data-only retry after remote-schema exit uses that same allowance. |
| Transport resubmission versus application abort and synchronization rollback | Transport handling does not consume or reset the allowance; application abort never retries; reconstruction after synchronization rollback uses the allowance. |
| Delayed acknowledgement, reconnect, or duplicate delivery | No duplicate application or unnecessary new application attempt. |
| Retry after history trimming or detached-content cleanup pressure | Required recovery data remains available, or an explicit fatal failure occurs before it is lost. |
| Application transaction callback with external side effects | Retry does not rerun the callback. |
| Retry metadata, labels, undo, and outcomes | Internal attempts preserve the logical edit contract without duplicate effects or false success. |
| Option C remote refresh before application changes | The latest remote content is visible without losing local read access or node identity; no op is sent. |
| Option C with supported schema-over-data rebase | Ordinary remote data edits preserve the pending upgrade without running the temporary schema-reconstruction path. |
| Option C with supported data-over-schema rebase | Retained application changes rebase over remote schema changes under the defined semantics, without the temporary reconstruction path. |
| Option C with supported schema-over-schema rebase | Equivalent and distinct permitted upgrades reconcile through the standard rebaser; genuine incompatibility still follows the defined error contract. |
| Option C ordered publication and mixed application transactions | Preserve order, identity, and constraints through rebase, sequencing, and resubmit without combining the automatic upgrade into the data commit. |
| Option C successful rebase with schema subchanges in its view update | Unaffected nodes and subscriptions survive; no temporary incompatible state reaches application callbacks. |
| Option C genuine conflicts and supported client versions | Follow the verified compatibility and retry-or-fail-stop policy across the complete schema/data rebase scope. |
| Incremental delivery and removal of Option C temporary workarounds | Remove each workaround only after all directions and change shapes it handles are supported; no caller depends on its internal state or notifications. |
| Option C publication after an earlier upgrade call | The original schema and data commits publish in order after application commit, without revision normalization for compaction. |
| C2 lifecycle after publication | Existing nodes remain usable and subsequent edits reach the correct shared branch through the persistent view checkout. |
| C2 repeated local edits and remote updates after deferral ends | No duplicate application, publication, or logical change notification; the view converges with the base. |
| C2 initial ordered publication followed by more edits | Original commit and inserted-node identities remain valid; the original schema/data changes are not published again. |
| Schema rejected followed by several data commits | Verify the current rejection cascade, each member's outcome, retained work, and one coordinated retry. Include data valid under the old schema. |
| Equivalent remote schema wins over the local pair | Verify that current rebasing still drops local data; retry retained data without another schema upgrade. |
| Schema accepted followed by data rejection or rollback | Keep the schema and never replay it; safely recover failed data or fail-stop. |
| Partial delivery and failure between submissions | Distinguish unknown, queued, submitted, and accepted members. Verify reverse-order batch rollback where supported; otherwise surface a terminal failure. |
| Explicit runtime batching for the ordered pair | Verify required non-interleaving and rollback boundaries without claiming all-or-nothing SharedTree acceptance. |
| Future rebaser changes rejection cascade | Assert that no accepted data requires a missing schema, and handle partial outcomes without duplicate replay or silent loss. |
| C2 local acknowledgement, reconnect, and resubmit | Correct outcome forwarding and no feedback loop between view and base. |
| C2 transactions, undo/redo, and application-created forks | Preserve transaction boundaries, metadata, history identity, and existing public behavior across synchronization. |
| C2 long sessions and view disposal | No unnecessary history accumulation or listener leaks; release private resources without disposing the base or losing submitted work. |
| Remote schema makes the document viewable before first edit | Deferral ends; the private upgrade is not published; subsequent edits use normal routing. |
| Remote schema is viewable but not equivalent to `U`, including `canUpgrade: false` | Deferral still ends; target equality, equivalence, and upgrade permission are not exit requirements. |
| Remote schema is still not viewable as-is | Do not end deferral based on the private upgraded view's compatibility; recompute or reconcile safely. |
| Remote schema ends deferral during a transaction or with retained local edits | Preserve application work and node identity; an abort does not restore the cancelled upgrade. |
| Remote schema ends deferral with an attempt already in flight | Track its actual outcome without assuming retraction, losing work, or creating another attempt with the cancelled upgrade. |
| Cleanup after remote-schema exit | Remove deferral-only resources safely; C2 retains its synchronized view branch. No repeated schema-upgrade preparation, public pending status, or special exit notification. |
| Staged policy and already-enabled upgrades | No disabled feature is enabled; queries reflect the local upgraded schema while internal replication state remains correct. |
| First-edit data undo/redo, including after a retry | Undo reverses the data change while retaining the schema upgrade; redo restores data without duplicating that upgrade. |
| Fork, merge, rebase, serialized replay, `revertTo`, and `rewindTo` | All otherwise valid operations work before and after publication and after remote-schema exit; no new pending-upgrade restrictions or trigger bypass. |
| Shared branches and independent views | The same supported operations and local-upgrade semantics work without assuming a main-branch attached runtime. |
| Post-processing and constraints | Correct origin tracking, subchange order, and rollback; no net-effect filtering. |
| Reconnect, resubmit, summary/load before and after first edit | Pending view state is not persisted; committed schema and data are preserved. |
| Older client receives ordered schema/data ops | It processes schema first, can invalidate its view as expected, and processes the later data consistently. |

Inspect the actual submitted change, not only the final tree.
For a simple first edit, require two separate tree commits in schema-then-data order.
An application transaction still follows its normal data-squashing rules.
Application operations that transfer multiple commits retain those commits and their order.
A runtime may batch messages, so do not equate commit count with transport-envelope count.
Before the first edit, also check the schema in a summary.
Zero outgoing messages alone does not prove that the shared checkout stayed unchanged.
For Option C, check the shared and private checkouts separately.

Run the same key cases with the reference, optimized, and expensive-debug forests.
Include both schema-validation settings.
Extend the existing [fuzz tests](../../src/test/shared-tree/fuzz) with deferred views, aborts, and concurrent first edits.
Measure opening cost, first-edit cost, and steady-state editing cost.
Do not add a full-document comparison to every edit.

The package already provides compile, Mocha, API-report, lint, snapshot, and benchmark scripts in [package.json](../../package.json).
Use focused tests first, then the relevant compatibility and persistence suites.

### Follow-up investigation on 2026-10-27

The [ordered-publication investigation](./deferred-schema-upgrades-implementation-plan.md#investigation-ordered-two-commit-publication) established the basis for the selected strategy.
Sixteen deterministic three-client probes passed, covering ordering, native data undo, inserted-node identity, rejection cascade, reconnect, runtime rollback, and accepted-schema/failed-data outcomes.
Another 82 existing tests passed across loader sequence validation, runtime batching/replay/rollback, and SharedTree conflicts.
These were local checks plus production-source tracing, not live service validation.
The probes do not replace the permanent M4-M7 integration tests.

### Follow-up checks performed on 2026-10-26

The following commands passed, run from the repository root:

```sh
pnpm --dir packages/dds/tree run build:esm
pnpm --dir packages/dds/tree run build:test:esm
pnpm --dir packages/dds/tree run test:mocha:esm --grep 'branches with schema edits can be rebased|getConstraintStatus' --reporter dot
```

The focused existing suites reported **9 passing tests**.
Seven additional temporary probe tests used two clients and the optimized forest.
All seven passed after the probe setup was corrected.
They directly checked each case in the Option C behavior table, including the private checkout state and appended commit shapes.
The probes were removed after the investigation; they were not added to the package test suite.

The open-transaction probe used the checkout API.
An earlier probe through the view API also encountered the existing broken-state behavior after the expected rejection.
The design must prevent that invalid operation, not use the exception as normal control flow.

These checks confirm current branch behavior.
They do not validate a deferred-upgrade implementation.

## 10. Agreed decisions and remaining design work

The following decisions were agreed on 2026-10-26 and updated on 2026-10-27:

1. Pursue Option C first.
2. Use C2: retain a persistent internal view branch and synchronize it with the base.
3. Use `schemaUpgradeMode: "immediate" | "deferred"`, initially opt-in with `"immediate"` as the default.
4. Require undo of the data change without reverting the schema upgrade.
5. Plan for early delivery with temporary workarounds.
   After an initial upgrade/edit publication is rejected or rolled back by synchronization, make one safe retry before failing.
   Fail-stop earlier if safe retry is impossible, and fail-stop after a failed retry.
   The internal retry policy can be fine-tuned later.
6. Support all existing public editing, branching, replay, and history operations.
   Do not introduce restrictions solely because a schema upgrade is pending.
7. Publish the pending schema upgrade and application data as separate ordered commits.
   Submit neither for an aborted application transaction.
   Correlate outcomes and retain work for one coordinated retry.
   Do not require all-or-nothing acceptance across the two commits or undo an already accepted schema when later data fails.
   Do not require compaction or mixed-commit undo projection for the normal C2 path.

Remaining design work is about implementation, not whether to omit these requirements:

- Establish ordered submission and any required runtime batch/rollback boundary while preserving original commit identities.
- Define one-retry reconstruction and per-member outcome tracking, including accepted-schema/failed-data cases and dependent edits.
- Preserve native data revertibles through persistent synchronization and translate them only where recovery changes data revisions.
- Coordinate transactions, base/view synchronization, event order, and resource lifetime.
- Isolate temporary rebase workarounds and remove them when the supported deployment permits it.

This document records the selected plan.
The existing branch probes do not establish that these implementation mechanisms already exist.

The single-commit compaction experiment is superseded for C2.
The requested cleanup removed its uncommitted code and replaced its integration coverage with ordered-publication and native-undo tests.
The separate `maxId` bug fix remains valid independently.
The cleanup is validated and awaiting review without a commit.
Per-member controller outcomes, submission-failure handling, and retry integration remain later implementation work.
