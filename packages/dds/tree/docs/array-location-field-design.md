# From counter fields to array-location fields

## Status and purpose

This design note captures conclusions and proposed next steps from the counter field experiment and the discussion on 2026-10-21.
It is not a supported API, an approved implementation plan, or a release commitment.
The counter implementation and its validation are recorded in the [counter field proof-of-concept report](./counter-field-kind-poc.md).
No array-location implementation or validation is claimed here.

This note incorporates the existing extrinsic-range direction from [microsoft/FluidFramework#27621](https://github.com/microsoft/FluidFramework/pull/27621), inspected at commit `78c058d79fa8f60bff2ccb55a5abd5b2392b450b`.
The PR's [design README][extrinsic-design] and [range API contracts][range-api] supersede the initial uncertainty here about position meaning, insertion affinity, removal behavior, and who maintains locations.
They specify an implemented constrained minimum viable product (MVP) and a planned index field kind; the MVP does not establish the future kind's concurrent merge behavior.

The proposed direction is an `arrayLocation` field kind that stores a numeric position and updates it through structured array-edit operations.
The PR calls this an `index` field kind; the final name and API signatures are not decided here.
It need not identify a particular array element.
This narrows the problem compared with assuming that every location must track stable element identity.

## Existing extrinsic-range direction

The PR chooses application-maintained locations stored elsewhere in the same tree.
Editing APIs update content and persisted numeric endpoints together.
Locations persisted outside the tree and presence are separate problems, not alternative targets for this experiment.
Automatically discovering and updating arbitrary references is also outside the selected approach.
The README explains that native-reference designs introduce additional history, incremental-summary, and partial-checkout concerns.

The MVP uses temporary insertion anchors to compute endpoint updates and document-wide no-change constraints to protect the transaction.
It also constrains undo/redo.
Concurrent edits can therefore reject the whole transaction rather than merge.
These constraints protect current invariants; their tests are not evidence that unconstrained index-field edits converge.

The baseline endpoint behavior is explicit:

- Endpoints are insertion points delimiting a half-open range; equal endpoints describe an empty range.
- Insertion at either endpoint moves it after the inserted content.
  Insertion at the range start is excluded; insertion at the end is included; empty ranges stay empty.
- Removal collapses affected endpoints to the start of the removed span.
  A range's lifetime belongs to its collection, not to the content it covers.
- Moves use insertion-point semantics.
  Ranges remain with their collection instead of following the moved content, including across managed arrays.

Use these rules as the starting contract, not questions to reopen without a concrete reason.
Move-following and alternative affinity policies are potential later features.
The future design still needs to settle concurrent range behavior, including cases where endpoints become swapped.

## Conclusions from the counter experiment

- **The storage model is suitable for numeric fields with different editing semantics.**
  Counters use a required-field-shaped numeric leaf and existing replacement deltas.
  Additive intent remains in changesets, not in the forest representation.
- **The modular change pipeline needed bounded extensions.**
  Field-generated builds and destructions enable computed replacement content.
  Atomic value-edit filtering lets minimization handle such edits without treating them as structural edits.
  These are reusable capabilities, not evidence that every future kind needs the same implementation.
- **The accessor API works, with a typing limitation.**
  Numeric initialization and stable `.value`/`.add()` accessors work across hydration and owner movement.
  Counter-only readonly object properties conflicted with existing generic TypeScript APIs.
  Direct assignment is rejected at runtime, but assigning another accessor can still type-check.
  This limitation is accepted for the experiment, not necessarily for a released API.
- **Stored content, initialization, property reads, and editing policy must remain separate.**
  An accessor is not persisted content.
  Fixed-leaf validation can be shared with identifiers without sharing identifier defaults, tracking, or editing semantics.
- **Integration tests are part of the extension infrastructure.**
  Rollback, remote-aware undo, minimization, lifecycle transitions, and summary/reload found issues that isolated arithmetic tests would miss.
  The selected regression suite passed 2,523 tests with seven pending; this is not full repository or production-readiness validation.

Remaining counter decisions include the numeric convergence contract, property readonly typing, supported format and upgrade policy, and standalone change-transfer support.
Performance and broader compatibility validation also remain.
Do not make all counter release work a prerequisite for a small array-location semantics experiment.

## Proposed array-location model

The user's proposal is to extend the counter-like model with conditional numeric transformations.
Rather than expose arbitrary conditions, the field could expose array-edit intent:

```typescript
// Illustrative API only; signatures and return values are not decided.
location.insert(index, count);
location.remove(index, count);
location.splice(index, deleteCount, insertCount);
```

These calls describe edits to apply to the location.
They do not, by themselves, imply that the field edits or automatically observes an array.
Following the existing direction, array/text editing APIs should supply corresponding endpoint edits in the same transaction as content edits.
The exact translation from content changes to field operations remains an integration task.

Structured operations preserve information that a locally computed numeric difference would lose.
They also give boundary behavior, rebasing, and undo a domain-specific contract.
Whether the implementation uses conditional arithmetic internally remains open.

### Sequential baseline from the range API

Let `p` be the current position, `i` the edit index, and `n` the number of inserted or removed items.
The following rules assume valid nonnegative integer inputs and valid array edits.
Integer bounds and validation without access to an array length remain design questions.

For insertion:

```text
p' = p       when p < i
p' = p + n   when p >= i
```

At `p == i`, this follows the MVP's after-insertion affinity.
Configurable affinity is not required for the initial experiment.

For removal, endpoints inside the removed interval collapse to its start:

```text
p' = p       when p < i
p' = i       when i <= p < i + n
p' = p - n   when p >= i + n
```

Equivalently:

```text
p' = p - min(n, max(0, p - i))
```

These rules describe positions between items, including the end position, not references to particular items.
They preserve a valid empty position when all content is removed.

A splice could apply removal followed by insertion.
Verify that a combined splice operation matches the existing sequence and anchor behavior rather than assuming that its concurrent semantics follow from this decomposition.
Following an element through an array move is not part of the baseline.

## What differs from counter algebra

### Concurrent edits

Conditional position transformations do not generally commute.
For a starting position of 5:

- Inserting two items at index 3 and then removing one at index 6 gives position 6.
- Removing one at index 6 and then inserting two at index 3 gives position 7.

This example uses unchanged coordinates to show order dependence.
It is not itself a specified outcome for concurrent array edits.
Concurrent operations need rules for interpreting and rebasing their coordinates, overlaps, and insertion ties.
Reevaluating conditions against the current numeric value alone does not establish convergence.

The PR already selects coordinate-aware rebasing and sequence reuse as the design direction.
Its README proposes reusing sequence changeset logic, including rebasing and operations.
Treat that as a reuse objective to investigate, not a verified claim that the existing handler can be used unchanged.
In the [overlapping-removal discussion][removal-discussion], Yann notes that both the threshold and adjustment can need rebasing; Craig agrees that removals and moves need richer operations and should share sequence logic.

Retain array-edit intent in the candidate changeset rather than recording only the difference observed locally.
Do not assume one counter-style summed amount can represent a composed sequence of edits.
Determine what representation remains correct under composition, rebasing, and minimization.

The content array and endpoint fields must interpret corresponding edits consistently.
Inspect existing sequence changesets and index/anchor transformations before inventing an independent transformation algebra.
Stable element identity and cross-field dependencies are not established prerequisites for this numeric-position model.

### Undo and rollback

Removal with collapse loses information: several starting positions map to the same result.
Inserting the removed length does not recover the original position in general.

Investigate what original offset, edit context, or other repair information is needed for undo.
Restoring an old numeric value blindly would discard intervening remote effects.
Test normal undo, redo, and transaction rollback separately; the counter experiment already showed that their temporary-ID requirements can differ.

### Range membership and bulk editing

A correct index field does not by itself make the range collection safe under unrestricted concurrency.
An explicit list of endpoint edits cannot update a range that another client concurrently adds outside that list.
It also makes operation size proportional to the number of ranges.
The [bulk-editing discussion][bulk-discussion] identifies both problems.

The planned progression is:

1. Introduce index fields for endpoints while retaining constraints that protect changes to the range collection.
2. Narrow constraints using a replaceable membership marker or a shallow no-change constraint, as available.
3. Use path-based bulk editing to express updates to the applicable set of endpoints, with defined behavior under concurrent membership edits.

Bulk editing has its own semantics and implementation work; naming it does not establish correctness.
Keep this track explicit, but do not require its implementation to test one index field.
Similarly, independently correct endpoints do not settle all range behavior: endpoint crossing, explicit bound changes, undo, and any future move-following policy may require coordination.
The PR leaves open whether some behavior would benefit from a two-child range field or distinct endpoint kinds.
Do not constrain reusable terminal-field infrastructure to one numeric child solely because counters use one.

## Proposed next steps and decision gates

1. **Adopt the existing contract and identify only the remaining decisions.**
   Start with insertion points, after-insertion affinity, collapse on removal, collection-owned range lifetime, and explicit updates from content-editing APIs.
   Specify numeric bounds, combined-splice behavior, explicit bound changes, and the scope of move tests.
   Keep move-following out of scope unless separately approved.
2. **Investigate sequence reuse before implementing a new algebra.**
   Trace sequence changeset composition, rebasing, inversion, and index/anchor transformations.
   Identify reusable code, needed extraction, and dependencies that assume actual sequence children or retained removed content.
   Distinguish operation-coordinate rebasing from applying an already rebased operation to an endpoint.
   Record any reason to diverge from sequence behavior and consult before a substantial shared-layer refactor.
3. **Run a small changeset-algebra experiment.**
   Define operation coordinates and candidate compose, rebase, invert, and rollback behavior.
   Start with a pure numeric reference model and short edit histories rather than wiring schema factories or persistence.
   Use the counter implementation as prior art, not as an assumed algebra.
4. **Test the difficult cases before integrating.**
   Cover insertion ties, both removal boundaries, positions inside removals, zero-length edits, overlapping removals, replacement, and multiple concurrent edits.
   Check equivalent rebased histories for convergence and composition against sequential application.
   Check undo after remote edits and preservation of information needed to undo collapsed locations.
   Compare sequential results with existing insertion-anchor behavior.
   Check paired endpoints as well as individual positions, and explicitly record unresolved crossing or bound-edit cases.
   Do not use the MVP's rejection of concurrent transactions as a substitute for testing the new merge semantics.
   Use small exhaustive or generated cases in addition to hand-written examples.
5. **Assess reuse and cost from the evidence.**
   Determine whether numeric-leaf storage and the existing modular extensions suffice.
   Identify repair data, changeset growth, coordinate transformation, and any array association requirements.
   Stop for consultation if the model requires stable element identity, a new shared-layer architecture, or a significant compatibility change.
6. **Only then propose an integrated proof of concept.**
   Reuse appropriate accessor, validation, and field-handler infrastructure without building a speculative plugin framework.
   Apply the [field-kind extension checklist](./counter-field-kind-poc.md#adding-the-next-kind-extension-checklist).
   Include hydrated/unhydrated editing, events, lifecycle, minimization, persistence, and an explicit format strategy.
   Include a migration plan from ordinary numeric endpoint fields; the PR separately identifies field-kind schema evolution and safe rollout as required work.
   State which membership constraints remain until bulk-editing semantics are implemented and validated.

The immediate deliverable should be a small, tested semantic model and a written assessment of its limits.
A successful experiment would show that the proposed operations support the agreed sequential, concurrent, and undo behavior with an understandable representation.
A useful negative result would identify a minimal counterexample or a concrete requirement for more context or identity.
Neither outcome requires committing to a production API first.

[extrinsic-design]: https://github.com/microsoft/FluidFramework/blob/78c058d79fa8f60bff2ccb55a5abd5b2392b450b/packages/dds/tree/src/extrinsic-locations/README.md
[range-api]: https://github.com/microsoft/FluidFramework/blob/78c058d79fa8f60bff2ccb55a5abd5b2392b450b/packages/dds/tree/src/extrinsic-locations/extrinsicLocationsNamespace.ts
[removal-discussion]: https://github.com/microsoft/FluidFramework/pull/27621#discussion_r3768414346
[bulk-discussion]: https://github.com/microsoft/FluidFramework/pull/27621#discussion_r3779745476
