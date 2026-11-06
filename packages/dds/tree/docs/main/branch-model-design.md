# SharedTree branch model

**Status:** Draft design direction with an implemented first milestone, not a complete specification.

**Implementation baseline:** [microsoft/FluidFramework#28520](https://github.com/microsoft/FluidFramework/pull/28520), now merged.
Implementation claims below refer to its final head, `e11581cbbed5666d9e43987d50ba0fb2afb93490` on `branch-checkout-api`, rather than the current workspace.

This document distinguishes implemented behavior from design principles, illustrative APIs, and open questions.

## Main idea

The goal is to expose branches as an explicit application-facing concept, independent of typed-view lifetimes.
The implemented milestone introduces independently owned branches, typed-view creation, and child forks, separating branch lifetime from view lifetime.
Applications still use the existing view APIs for merge, rebase, history inspection, and branch observation.

The proposed model would expose those capabilities directly on branches, separating branch state, history, and operations from typed access through views.
Moving a view between branches is a separate, later feature that requires its own ownership, schema, reference-validity, transaction, event, and failure contracts.

In the proposed model, responsibilities are divided as follows:

| Object | Responsibility |
| --- | --- |
| SharedTree | Provides the collaborative tree and access to its document-owned main branch. |
| Branch | Represents independently identifiable tree state and history; provides supported branch operations and creates typed views. |
| View | Provides typed reading, editing, observation, and transactions. |

### Implementation constraints

Checkouts remain an internal implementation detail, coordinating branch history with tree state, stored schema, transactions, and view creation.
The public branch API builds on this functionality without exposing checkout types.
In the implemented milestone, `BranchCheckout` extends `CheckoutBase` and directly implements `TreeBranchHandleAlpha`; no separate wrapper is needed.
Likewise, future public capability interfaces need not correspond to separate implementation objects.

### Design scope

This proposal covers the document-owned main branch and independently owned branches.
Extending the same API to additional document-backed shared branches is outside its scope.

## 1. Current API

The current API was introduced in [microsoft/FluidFramework#28520](https://github.com/microsoft/FluidFramework/pull/28520).
The branch handle inherits its read-only `disposed` property from `IDisposable`:

```typescript
interface TreeBranchHandleAlpha extends IDisposable {
  viewWith<TSchema extends ImplicitFieldSchema>(
    config: TreeViewConfiguration<TSchema>,
  ): TreeViewAlpha<TSchema>;

  fork(): TreeBranchHandleAlpha;

  dispose(): void;
}

export interface ViewableTreeAlpha extends ViewableTree {
  // Other members omitted.
  forkBranch(): TreeBranchHandleAlpha;
}
```

`ViewableTreeAlpha` defines `forkBranch()`, and `ITreeAlpha` inherits it.
For a SharedTree, `forkBranch()` forks the main branch; for a tree created with `createIndependentTreeAlpha()`, it forks that tree's current state.
Neither case requires a source view or a schema configuration.
In the examples below, `schema` is the application's root schema and `config` is a `TreeViewConfiguration<typeof schema>` used to create typed views:

```typescript
const branch: TreeBranchHandleAlpha = asAlpha(tree).forkBranch();
const branchView: TreeViewAlpha<typeof schema> = branch.viewWith(config);
const child: TreeBranchHandleAlpha = branch.fork();

// Edit through branchView.

branchView.dispose();

// The branch is still available.
const replacementView: TreeViewAlpha<typeof schema> = branch.viewWith(config);

child.dispose();
replacementView.dispose();
branch.dispose();
```

Applications can retain editable alternatives, recreate typed access, and fork descendants.
Merge and rebase remain available through existing view APIs, but public branch handles do not yet expose those operations, history, or events.

## 2. Provide access to existing branches

Applications need a way to access an existing branch without creating a fork.
An application might display an editable preview while a background component observes the main branch.
That component needs access to the existing main branch without creating another fork or a typed view.

An explicit adapter could distinguish access to the main branch from creation of an independent branch:

```typescript
const mainBranch: TreeBranchAlpha = asAlphaBranchModel(tree); // Access the existing branch.
const alternative: TreeBranchHandleAlpha = mainBranch.fork(); // Create an independent branch.
```

The adapter would not create a view and would signal use of an experimental API.

Views should also provide access to their associated branch:

```typescript
const branch: TreeBranchAlpha = view.branch;
```

These names are illustrative; see the [entry-point questions](#branch-access-and-operations) and the [ownership rules](#4-keep-ownership-rules-clear).

## 3. Put branch operations on public branch interfaces

Applications should be able to fork, merge, rebase, inspect history, and observe branch changes without creating a typed view.
The following illustrative sketch separates common branch operations from capabilities available only on independently owned branches.
The view interface shows only branch association; existing typed-access, schema, observation, and transaction APIs are omitted.

Main-branch access and `view.branch` would return `TreeBranchAlpha`, which exposes neither `dispose()` nor `rebaseOnto()`.
Forking would return an independently owned `TreeBranchHandleAlpha`, which adds those operations.

```typescript
interface TreeBranchAlpha {
  readonly events: Listenable<TreeBranchEvents>;
  readonly branchHistory: TreeBranchHistory;

  fork(): TreeBranchHandleAlpha;

  viewWith<TSchema extends ImplicitFieldSchema>(
    config: TreeViewConfiguration<TSchema>,
  ): TreeViewAlpha<TSchema>;

  merge(
    source: TreeBranchHandleAlpha,
    disposeMerged?: boolean,
  ): void;
}

interface TreeBranchHandleAlpha extends TreeBranchAlpha {
  readonly disposed: boolean;

  rebaseOnto(target: TreeBranchAlpha): void;
  dispose(): void;
}

interface TreeViewAlpha<TSchema extends ImplicitFieldSchema> {
  readonly branch: TreeBranchAlpha;

  dispose(): void;
}
```

**Recommendation:** Initially restrict branch-level merge sources to independently owned handles whose branches share a common ancestor with the destination, as shown here.
The [ownership and disposal rules](#4-keep-ownership-rules-clear) apply to these operations.

These APIs would be additive.
Existing view APIs would remain available; this proposal does not deprecate or remove them.

## 4. Keep ownership rules clear

The document owns its main branch; applications must not dispose or rebase it.
Callers own the independent branches returned by `tree.forkBranch()` or `branch.fork()`.
The proposed accessors—an adapter, a tree property, or `view.branch`—would not transfer ownership.

The current API supports two view-ownership models:

| View creation | Ownership and disposal |
| --- | --- |
| `branch.viewWith(config)` | The view borrows the branch. Disposing the view leaves the branch available for another view. |
| `view.fork()` | The returned view owns its new independent branch. Disposing the view also disposes that branch. |

Disposing an independently owned branch also disposes its active view.
Parent and child branches have independent lifetimes: disposing either does not dispose the other.

A successful merge disposes an independently owned source branch and its view by default.
Passing `false` for `disposeMerged` preserves both.
The destination is not disposed, and a document-owned source must never be disposed through a merge.
The proposed branch-level merge should initially retain this default.

Applications must dispose independently owned branches when finished; disposing a borrowed view alone does not end the branch's lifetime or its history-retention requirements.
All view-creation APIs should document their ownership model.
These ownership rules describe views that remain associated with their original branch.

The implemented milestone permits one active view per branch.

### Long-term proposal

Once views expose their associated branch through `view.branch`, prefer `view.branch.fork()` followed by `branch.viewWith(config)` for new code.
The application owns the returned branch, and the view borrows it:

```typescript
const branch: TreeBranchHandleAlpha = view.branch.fork();
const branchView: TreeViewAlpha<typeof schema> = branch.viewWith(config);

// Release typed access without discarding the branch.
branchView.dispose();

// Explicitly end the independently owned branch's lifetime.
branch.dispose();
```

Disposal follows the borrowed-view rules above.
This workflow also avoids transferring responsibility for either branch's disposal when a borrowed view switches branches.
The tradeoff is explicit branch cleanup and a separate call to create typed access.

The existing `view.fork()` API would retain its current branch-owning behavior; changing it silently could leak branches in applications that rely on view disposal.
Whether to deprecate that convenience API is a separate decision, not part of this proposal.
Supporting switching for existing branch-owning views would still require the [ownership contract](#view-switching).

## 5. Allow merge and rebase without creating views

The long-term API should expose merge and rebase directly on branches, with the same direction as the existing view APIs.
`destination.merge(source)` applies the source branch's changes to the destination:

```typescript
main.merge(branch);
```

By contrast, `local.rebaseOnto(target)` updates the local branch to include the target's history, then reapplies the local branch's unique changes on top.
For example, to bring an independently owned branch up to date with the main branch while preserving its own edits:

```typescript
branch.rebaseOnto(main);
```

Only `branch` changes; `main` is unchanged, and neither branch is disposed.
The branch remains an independent alternative: its edits do not become part of `main` until explicitly merged.

These are separate examples, not a sequence of calls.
Both operations use SharedTree’s existing rules for combining changes.

The proposed operations retain the [ownership and disposal rules](#4-keep-ownership-rules-clear) and [transaction restrictions](#8-keep-transactions-as-a-separate-feature).

## 6. Move views between branches

The following example illustrates proposed view switching.
A branch-bound checkout keeps the same underlying branch, so switching should move the view rather than replace the checkout's branch.

For this example, the proposed `TreeViewAlpha<TSchema>` additionally exposes `switchTo(branch: TreeBranchAlpha): void`; this method is not part of the current API.

```typescript
const main: TreeBranchAlpha = asAlphaBranchModel(tree);
const alternative: TreeBranchHandleAlpha = main.fork();
const view: TreeViewAlpha<typeof schema> = main.viewWith(config);

view.switchTo(alternative);
// Edits now affect alternative.

view.switchTo(main);
// Edits now affect main.
```

This example uses a borrowed view, consistent with the [long-term ownership proposal](#long-term-proposal).
Switching should neither merge changes nor dispose either branch.
The [view-switching questions](#view-switching) cover the remaining contracts, including whether and how existing branch-owning views could switch.

## 7. Show unsupported operations in the types

The implemented branch handle does not expose `rewindTo()`, but `viewWith()` returns a `TreeViewAlpha` whose type includes it.
Calling `rewindTo()` on that view, or on a fork of that view, throws a `UsageError` because its checkout does not support replacing the underlying branch.

The proposed API should express that restriction in its types rather than presenting an unsupported operation as generally available.
This refinement preserves branch identity.

## 8. Keep transactions as a separate feature

Transactions still provide constraints, rollback, nesting, and grouped commits.
A transaction can be explained as using a temporary branch, but ordinary `fork()` and `merge()` operations do not provide all transaction guarantees.
The core branch API does not require a public squash operation.

The implemented `tree.forkBranch()` and `branch.fork()` APIs reject pending source transactions, while merge and rebase reject pending transactions on either participating branch.
Callers must finish transactions before invoking these operations.
The proposed branch API should preserve these restrictions unless a behavior change is designed separately.
Exposing branch access would not, by itself, expose transaction-local branches; the transaction-access questions are collected in [Section 11](#11-additional-considerations).

## 9. Separate branch events from view observation

Proposed branch events would describe changes even when no typed view is attached, while view-level observation would follow the branch associated with the view.
This separation would let applications observe the main branch independently of a view accessing another branch.
Internal checkout events could supply the implementation without being exposed directly.

The branch-event contracts must be defined before those events are exposed; see [Section 11](#11-additional-considerations).

## 10. Delivery sequence

The proposed delivery order allows branch-level operations and capability refinements to ship without waiting for view switching.

1. [Current API](#1-current-api) ([`9ea98a1`](https://github.com/microsoft/FluidFramework/commit/9ea98a15a67e51642eaa343bb570329404ac9acd) on `main`): Independently owned branch handles, typed-view creation, and child forks.
2. [Existing-branch access](#2-provide-access-to-existing-branches) and [branch-level operations](#3-put-branch-operations-on-public-branch-interfaces): Enable the [explicit-ownership workflow](#long-term-proposal) through `view.branch.fork()`, and add merge, rebase, history, and events as their [contracts](#branch-access-and-operations) are settled. These additions can ship separately.
3. [Capability refinements](#7-show-unsupported-operations-in-the-types): Express unsupported view operations in the types.
4. [View switching](#6-move-views-between-branches): Add `switchTo()` after resolving the [view-switching questions](#view-switching).

The [future extensions](#future-extensions) are outside this sequence.

## 11. Additional considerations

### Open questions

These questions are grouped by capability.
Each capability needs its own contracts, but not every question blocks the initial branch API.

#### Branch access and operations

- **Entry points and naming:** Should existing-branch access use an explicit adapter such as `asAlphaBranchModel(tree)` or a property such as `tree.branch`?
  The public interface names also remain open.
- **Transaction access:** What does `view.branch` represent during a transaction, and does its association change on commit or rollback?
  Can transaction-local state be accessed or forked, and how would such forks interact with commit and rollback?
  These contracts must be settled before exposing branch access during transactions.
- **Merge sources and disposal:** Should branch-level merge use the source restriction recommended in [Section 3](#3-put-branch-operations-on-public-branch-interfaces)?
  If document-owned sources are later allowed, should a disposal request be ignored or should that combination be rejected?
  Any change must preserve the [ownership rules](#4-keep-ownership-rules-clear); changing the existing disposal default would be a separate decision.
- **History and event contracts:** What history-inspection contract should branches expose without a typed view?
  What are the branch-event contracts for merge, rebase, and transaction completion?
- **Existing view APIs:** Should view-based branch operations, including the branch-owning `view.fork()`, remain as convenience methods or enter a future deprecation process?
  Any deprecation decision is outside this additive proposal.

#### Capability types

- **Unsupported operations:** How should the types express capabilities so that handle-created views do not expose unsupported operations such as `rewindTo()`?

#### View switching

- **Existing branch-owning views:** Should views created through the current `view.fork()` API support switching?
  If so, who owns the original branch after switching, and which branch, if any, is disposed when the view is disposed?
  Possible policies include rejecting switching for branch-owning views or requiring an explicit ownership handoff.
  No policy is selected here.
  Switching must not leave the original branch without an owner or implicitly transfer ownership of the destination.
- **Eligible branches:** Which branches can a view switch between?
- **Schema compatibility:** Should switching to an incompatible schema fail or attach a view that reports incompatibility?
  The current `viewWith()` behavior does not decide the switching rules.
- **Occupied destinations:** What happens if the destination already has a view?
- **Reference validity:** Which node references and bindings remain valid?
- **Event ordering:** When are events sent during switching?
- **Failure guarantees:** What happens on failure, including whether association and ownership remain unchanged?
- **Transactions:** Is switching allowed during a transaction?

The ownership question for existing branch-owning views applies to sequences such as:

```typescript
const ownedView = view.fork();
ownedView.switchTo(alternative);
ownedView.dispose();
```

### Future extensions

Multiple active views and historical branch creation are possible extensions, not commitments or prerequisites for the proposed delivery sequence.
If multiple views are supported later, they should share branch state rather than create independent forks.
Disposing one borrowed view must preserve the others, while disposing the branch should dispose all attached views.

A possible history-navigation API is:

```typescript
const historical = branch.forkAt(revision);
view.switchTo(historical);
```

Unlike reverting, which adds a change to the existing branch, `forkAt()` would create a new independent branch at an available historical revision without replacing the original branch.
It needs rules for retained history and available revisions.

### Performance considerations for multiple views per branch

Accessing an existing branch must not fork state, and attaching another view to the same branch should not require cloning its checkout or forest.
Independent forks would retain their existing state-copy and history-retention costs.
View switching could incur projection cleanup and recreation costs, so it should not be assumed to take constant time.
