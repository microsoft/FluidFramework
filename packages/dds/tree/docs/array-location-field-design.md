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

## Focused investigation results, 2026-10-22

This pass investigates reuse and extraction boundaries, not a production index implementation.
The executable evidence is in [indexProjection.spec.ts](../src/test/feature-libraries/sequence-field/indexProjection.spec.ts).
The tests use the real sequence editor, rebaser, inverter, and composer, then apply shallow effects to real unhydrated insertion anchors.
Inserted values are placeholders; this tests endpoint positions rather than restoration of content identity.
The projection helper supports separate insertion/removal marks, not arbitrary replacements, child edits, or a complete move model.
These tests characterize the existing projection's limitations; they do not prescribe those limitations for the future field kind.

### Two different reuse boundaries

1. **Applying a known edit to a current position.**
   The private `adjustIndexForArrayDelta` helper in [arrayNode.ts](../src/simple-tree/node-kinds/array/arrayNode.ts) already contains the insertion/removal arithmetic.
   It consumes shallow deltas after the edit, not sequence changesets or revision history.
   Its event subscription, missing-delta fallback, defensive clamping, and disposal are separate from the arithmetic.
   The new tests verify the baseline formulas for lengths 0 through 5, insert counts 0 through 3, every legal removal, and every endpoint position.
   This is a useful small helper extraction candidate, not a persisted-index rebaser.
2. **Transforming edit intent across revisions.**
   [Sequence changesets](../src/feature-libraries/sequence-field/types.ts) retain empty-cell identities, revisions, detach overrides, and move endpoints.
   [Rebasing](../src/feature-libraries/sequence-field/rebase.ts) uses those identities and revision ordering, not only numeric offsets.
   [Inversion](../src/feature-libraries/sequence-field/invert.ts) restores removed content by cell identity and distinguishes normal undo from rollback.
   These are promising reusable mechanisms, but are not equivalent to applying shallow deltas to a scalar.

### Counterexample: correct sequence rebasing does not make scalar projection converge

Start with content `[0, 1, 2, 3]` and range endpoints `[1, 2)`.
Concurrently:

- A removes two items at index 1.
- B inserts `99` at index 2.

The actual sequence rebaser produces:

- B over A: insert at index 1.
- A over B: remove the two original items on either side of `99`, preserving the concurrent insertion.

Both paths produce content `[0, 99, 3]`.
However, applying the current insertion-point projection after each edit gives:

| Path | Endpoint evolution | Final range |
| --- | --- | --- |
| A, then B rebased over A | `[1, 2)` to `[1, 1)` to `[2, 2)` | Empty |
| B, then A rebased over B | `[1, 2)` to `[1, 3)` to `[1, 2)` | Covers `99` |

This is not a sequence convergence defect and does not violate the constrained MVP's guarantees.
It disproves the narrower proposal to obtain a convergent persisted index simply by combining sequence-rebased edits with the current scalar projection.
It also shows why sequential affinity rules alone do not settle concurrent range behavior.
The example does not establish that a paired range field is required: even the single starting endpoint at 1 diverges.

### Counterexample: numeric projection loses undo and composition information

Starting positions 1, 2, and 3 all become 1 after removing `[1, 3)`.
Applying the sequence inverse restores two items at 1, so the current after-insertion projection moves all three positions to 3.
It cannot recover the original interior position 2.

The actual sequence composer reduces the removal followed by its inverse to an empty delta.
Projecting that composed delta leaves the original positions unchanged, unlike projecting both edits in order.
Both normal-undo and rollback variants exhibit this distinction in the tests.

Consequently, this projection does not preserve composition of sequence edits.
A persisted handler must not derive its endpoint transformation solely from the final composed content delta.
It needs additional context or endpoint-specific transformation rules; the representation has not been chosen.
Retaining information about a removed position in changesets does not necessarily require storing element identity in the forest or implementing native references.

### Implications for shared infrastructure

- **Reuse sequence logic selectively, not its whole handler unchanged.**
  [Sequence delta conversion](../src/feature-libraries/sequence-field/sequenceFieldToDelta.ts) attaches and detaches sequence children.
  Its [removed-root reporting](../src/feature-libraries/sequence-field/relevantRemovedRoots.ts) expects corresponding content.
  A numeric endpoint instead needs to materialize one numeric value and manage its own undo context.
- **Separate operation IDs from numeric-leaf storage IDs.**
  Sequence [cross-field keys](../src/feature-libraries/sequence-field/utils.ts) are registered even for inserts, which can become moves after rebase.
  The [modular inverse tables](../src/feature-libraries/modular-schema/modularChangeUtils.ts) map these keys to individual fields.
  Copying the same sequence operation IDs into every endpoint field cannot be treated as independent registrations.
  An adapter needs a deliberate internal namespace or coordination strategy; none is implemented or verified here.
- **Do not reuse structural filtering for virtual sequence operations without an adapter.**
  Sequence filtering selects actual child attaches and detaches.
  An index field's sequence-like operations describe edits to another sequence, not movable children of the endpoint field.
  The counter's atomic-value filtering is a useful candidate boundary, but it does not yet prove preservation of index repair information or revision context.
- **Do not equate unchanged numeric output with an empty changeset.**
  An edit after the current position may leave its number unchanged while still changing the coordinate context for other edits.
  Emptiness and pruning need a semantic definition before extracting a generic value-field rebaser.
- **Retain the numeric storage hypothesis.**
  Nothing in these probes requires a different forest shape or a new delta primitive.
  What they rule out is an insufficient transformation model, not replacement-based storage.

### Cleanup candidates and proposed PR order

These are extraction candidates, not PRs opened by this investigation.
Each should be prepared against current upstream independently, without the experimental counter registration or format entries.
The tests in this branch provide evidence but do not replace validation of each extracted patch.

| ID | Candidate and independent justification | Dependencies and readiness | Required validation |
| --- | --- | --- | --- |
| C1 | Correct the stale no-op/deprecation description on [transaction minimization](../src/shared-tree/transactionMinimize.ts), which already invokes the minimizer. | Ready to prepare; no index dependency. Verify whether changing the deprecation tag affects generated reports. | Documentation model and any affected generated API reports. |
| C2 | Characterize and optionally extract shallow index arithmetic from [arrayNode.ts](../src/simple-tree/node-kinds/array/arrayNode.ts), keeping event timing, clamping, and disposal unchanged. | Ready for a small internal PR if there is a concrete second caller; otherwise land tests first and leave the function local. Not a concurrent index API. | Boundary tests for inserts, removals, combined marks, and moves; existing hydrated/unhydrated anchor tests. This investigation covers only the insertion/removal subset. |
| C3 | Enforce identifier fixed-leaf restrictions consistently through schema construction and reconstruction, using the counter experiment's validation findings. | No index-algebra dependency, but first reproduce malformed identifier acceptance and decide compatibility for newly rejected inputs. Not yet a confirmed bug-fix PR. | Identifier defaults/indexing regressions, malformed schema tests, valid lazy/staged reconstruction cases. Do not add counter identifiers to the standalone patch. |
| C4 | Add optional field-generated delta builds/destructions with explicit ownership, conflict, and ID contracts. | Can be prepared without a final index design. This is a functional extension, not merely cleanup; justify it with a test-only handler and an identified consumer. | Nested/sibling aggregation, outer-build coexistence, conflict suppression, reference ownership, and cleanup on both forests. Do not introduce the experimental counter to make the tests work. |
| C5 | Add atomic-value minimization/filtering independently of structural attach/detach selection. | Design-sensitive. Extract only after a test-only atomic handler demonstrates the contract, including retained context. C4 is needed if that handler materializes replacements; the option itself need not depend on C4. | Existing/built/removed parents, cross-parent moves, muted changes, undo and rollback; distinguish observable effects from semantic bookkeeping. |
| C6 | Extract sequence transformation utilities or an endpoint adapter. | Wait for a representation that passes the counterexamples above. Investigate IDs, repair context, explicit bound edits, and movement before selecting a reusable interface. | Composition and rebase properties, overlapping removals, undo/redo, endpoint pairs, and revision replacement. |
| C7 | Generalize terminal/static fields and accessor lifecycle helpers. | Wait for a second concrete consumer. Do not encode one-child, no-repair-data, additive, or destroy-on-every-edit assumptions in a shared abstraction. | Identifier/counter behavior and the eventual endpoint consumer; consider multi-child range state only when justified. |
| C8 | Split raw-content/accessor types, add public overloads, or introduce persisted format selection and field-kind migration. | Feature-coupled preparation, not an automatic standalone cleanup. Retain on the experiment branch until independently justified and reviewed for API/format compatibility. | Consumer generic typing, API review, reconstruction and serialization, stable-format regression and migration tests. |

C1 and independently useful tests can proceed now.
C2 and C3 need their stated evidence before extraction.
C4 can be evaluated as a bounded extension without waiting for all index semantics.
C5 through C7 benefit directly from the index investigation and should not be generalized from the counter alone.
C8 remains outside the current productionization scope.
No candidate requires completing bulk editing first; that is a separate integration track.

### Validation and stopping point

Formatting, ESLint, and test compilation passed.
All four investigation tests passed with:

```sh
cd packages/dds/tree
pnpm exec biome check src/test/feature-libraries/sequence-field/indexProjection.spec.ts
pnpm exec eslint src/test/feature-libraries/sequence-field/indexProjection.spec.ts
pnpm run build:test:esm
NODE_OPTIONS=--conditions=allow-ff-test-exports pnpm exec mocha \
  --no-config \
  --require @fluid-internal/mocha-test-setup \
  --require source-map-support/register \
  lib/test/mochaHooks.js \
  lib/test/feature-libraries/sequence-field/indexProjection.spec.js \
  --reporter spec --timeout 30000 --exit
```

Default repository discovery also passed all four tests:

```sh
cd packages/dds/tree
NODE_OPTIONS=--conditions=allow-ff-test-exports pnpm run test:mocha:esm \
  -- --grep '^Array index projection investigation'
```

No production code was changed.
This pass did not test arbitrary multi-revision histories, move rebasing, explicit bound changes, bulk editing, or a new index handler.
It provides a useful negative result for shallow projection and enough evidence to separate independent PRs from design-sensitive extractions.
The next index step is to propose a representation that retains enough endpoint context to pass these examples, using sequence identities and transformations where practical.
Do not start the broader terminal-field refactor or integration until that representation has been discussed.

## Contextual arithmetic follow-up, 2026-10-22

The shallow-projection counterexamples do not rule out conditional arithmetic with contextual rebasing and inversion.
A test-only model in [contextualIndex.spec.ts](../src/test/feature-libraries/sequence-field/contextualIndex.spec.ts) now demonstrates a positive result for operations expressed in one common coordinate system.
It is an intentionally history-retaining reference model, not a compact field handler.
It does not solve arbitrary causally authored edits.

### Arithmetic and context

Let `p0` be an endpoint in a common original array.
Each identified edit records an original index `i`, removal count `d`, and insertion count `n`.
For the active edits, define:

- `U`: the union of original intervals `[i, i + d)` being removed.
- `J`: the active insertions, retaining their original insertion coordinates.

Then compute:

```text
value(p0, history) =
    p0
    - length(U intersect [0, p0))
    + sum(n for insertions whose i <= p0)
```

This uses conditional addition and clamped interval subtraction.
The union matters: overlapping removals must not subtract their overlap twice.
Concurrent insertions are not original cells, so a removal authored in the original context does not remove those inserted cells.
Endpoint affinity remains after-insertion.

For a single edit, this gives the usual insertion formula and collapse-on-removal formula.
The experiment defines a same-context splice as those two effects sharing an original index; it does not claim this establishes the future sequence splice contract.

### Composition, rebasing, inversion

The changeset model retains identified events and their common endpoint basis rather than just a locally observed numeric difference.

- **Composition:** retain the union of events, deduplicated by identity.
  This operation is associative and independent of event arrival order.
  It is not composition of arbitrary edits whose coordinates refer to different intermediate arrays.
- **Rebase A over B:** retain both histories and produce the contextual numeric transition from `value(p0, B)` to `value(p0, A union B)`.
  Rebasing B over A reaches the same target.
  Computing that target requires the original endpoint and histories; the current collapsed number is insufficient.
- **Undo A:** add an identified revert event targeting A, then reevaluate with A inactive.
  Other removals still cover their own intervals, and other insertions retain their effects.
  Undo is not an ordinary insertion of A's removed length.
- **Redo:** revert the undo event.
  Events form an acyclic dependency graph; an event is inactive when an active revert targets it.
  Multiple active reverts of the same event keep it inactive until those reverts are themselves inactive.
- **Rollback:** discarding an uncommitted edit recovers the preceding active history.
  The model's revert mechanism can also represent that reversal, but it does not implement SharedTree revision normalization or transaction processing.

For this defined domain, convergence follows from identical event sets producing identical active edits, interval unions, and insertion sums.
It is not inferred solely from testing.
The resulting projection is monotone in `p0`: its removal term removes at most the intervening original distance, while insertion terms add nonnegative steps.
Consequently, consistently projected ordered endpoints do not cross in this restricted model.
Explicit endpoint reassignment and causal edits are outside that argument.

For the earlier remove `[1, 3)` versus insert at 2 example:

| Original position | Merged position, either order |
| --- | --- |
| 1 | 1 |
| 2 | 2 |
| 3 | 2 |

The original boundary distinguishes positions that temporarily collapsed together.
Undoing the removal restores their offsets while keeping the insertion contribution.
The test suite also exercises overlapping removals: undoing one does not restore cells still covered by the other.

### What remains unsolved

The shared-coordinate restriction is substantive.
If two items are inserted at 1 and a later edit removes one of those new items, interpreting that later removal as an interval of original cells is wrong.
An executable negative test shows the discrepancy: the correct endpoint is 2, while the untranslated model gives 3.

Extending the model requires a way to identify coordinates inside inserted content and retain collapsed-boundary distinctions across causal histories.
Sequence cell identities and revision transformations are candidates for that role, but no adapter has yet been implemented.
Moving content, explicitly setting endpoint bounds, changing range membership, and compatibility with the full sequence merge policy also remain unvalidated.
The per-event history representation is not a bounded-memory solution.
Compaction and summary/reload must retain whatever information outstanding edits and undo require; dropping it merely because the current numeric value is unchanged is not justified.

In particular, the model does not claim that adding an original `before` number to every counter-shaped edit is enough.
It retains removal intervals, insertion provenance in the shared basis, edit identity, and revert dependencies.
Those can live in change-processing context in an eventual design, but this experiment does not establish how they can be retired or reconstructed while persisting only a numeric leaf.

### Validation and consequence for the next step

The suite covers exhaustive pairs of same-context edits for array lengths 0 through 5, every valid original removal interval, insertion counts 0 through 2, and every original endpoint.
An independent discrete-cell counting oracle checks the arithmetic.
Additional tests cover the original divergence case, selective undo/redo with overlapping removals and a remote insertion, restoration of collapsed offsets, and all six delivery orders of a three-edit example.
The causal-coordinate counterexample explicitly marks the model's limit.

Formatting, ESLint, and `build:test:esm` passed.
All six tests passed with the focused runner:

```sh
cd packages/dds/tree
NODE_OPTIONS=--conditions=allow-ff-test-exports pnpm exec mocha \
  --no-config \
  --require @fluid-internal/mocha-test-setup \
  --require source-map-support/register \
  lib/test/mochaHooks.js \
  lib/test/feature-libraries/sequence-field/contextualIndex.spec.js \
  --reporter spec --timeout 30000 --exit
```

A combined default-discovery run for both investigation suites was attempted but failed during module loading because `sha.js` was missing from the environment.
It did not reach the tests; the successful focused run above does not establish current full-discovery health.
No dependencies or unrelated generated API reports were changed by this follow-up.

After the dependency installation was repaired, test compilation, focused Biome/ESLint checks, and both suites through default discovery passed (10 tests):

```sh
cd packages/dds/tree
NODE_OPTIONS=--conditions=allow-ff-test-exports pnpm run test:mocha:esm \
  -- --grep '^(Array index projection investigation|Contextual index arithmetic investigation)'
```

This is progress toward contextual arithmetic, not a claim to handle all array-location cases.
The next investigation should try a sequence-identity-based coordinate representation against both the positive tests and the causal-coordinate counterexample.
Broad terminal-field extraction should still wait; a compact index handler and complete rebase/inversion rules have not been demonstrated.

[extrinsic-design]: https://github.com/microsoft/FluidFramework/blob/78c058d79fa8f60bff2ccb55a5abd5b2392b450b/packages/dds/tree/src/extrinsic-locations/README.md
[range-api]: https://github.com/microsoft/FluidFramework/blob/78c058d79fa8f60bff2ccb55a5abd5b2392b450b/packages/dds/tree/src/extrinsic-locations/extrinsicLocationsNamespace.ts
[removal-discussion]: https://github.com/microsoft/FluidFramework/pull/27621#discussion_r3768414346
[bulk-discussion]: https://github.com/microsoft/FluidFramework/pull/27621#discussion_r3779745476
