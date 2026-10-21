# From counter fields to array-location fields

## Status and purpose

This design note captures conclusions and proposed next steps from the counter field experiment and the discussion on 2026-10-21.
It is not a supported API, an approved implementation plan, or a release commitment.
The counter implementation and its validation are recorded in the [counter field proof-of-concept report](./counter-field-kind-poc.md).
No array-location implementation or validation is claimed here.

The proposed direction is an `arrayLocation` field kind that stores a numeric position and updates it through structured array-edit operations.
It need not identify a particular array element.
This narrows the problem compared with assuming that every location must track stable element identity.

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
How an application or SharedTree array supplies these operations is a separate integration decision.

Structured operations preserve information that a locally computed numeric difference would lose.
They also give boundary behavior, rebasing, and undo a domain-specific contract.
Whether the implementation uses conditional arithmetic internally remains open.

### Candidate sequential rules

Let `p` be the current position, `i` the edit index, and `n` the number of inserted or removed items.
The following rules assume valid nonnegative integer inputs and valid array edits.
Integer bounds and validation without access to an array length remain design questions.

For insertion:

```text
p' = p       when p < i
p' = p + n   when p > i
```

At `p == i`, define whether the location stays before the inserted content or moves after it.
This choice is called affinity here.
Its default and whether it is configurable are not decided.

For removal, one candidate policy collapses locations in the removed interval to its start:

```text
p' = p       when p < i
p' = i       when i <= p < i + n
p' = p - n   when p >= i + n
```

Equivalently:

```text
p' = p - min(n, max(0, p - i))
```

These rules naturally describe positions between items, including the end position.
If the API instead describes an item index, removal of the referenced item and an empty array require an explicit validity policy.
Do not silently equate those two interpretations.

A splice could apply removal followed by insertion.
That is a candidate, not a settled replacement policy: affinity and the treatment of positions inside replaced content affect the result.
Following an element through an array move is also not implied by these rules.

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

Retain array-edit intent in the candidate changeset rather than recording only the difference observed locally.
Do not assume one counter-style summed amount can represent a composed sequence of edits.
Determine what representation remains correct under composition, rebasing, and minimization.

If the location tracks an actual collaboratively edited array, both must interpret the edits consistently.
For an application-managed external array, define what coordination the application supplies.
Stable element identity and cross-field dependencies are possible requirements of an integration, not established prerequisites for this numeric-position model.

### Undo and rollback

Removal with collapse loses information: several starting positions map to the same result.
Inserting the removed length does not recover the original position in general.

Investigate what original offset, edit context, or other repair information is needed for undo.
Restoring an old numeric value blindly would discard intervening remote effects.
Test normal undo, redo, and transaction rollback separately; the counter experiment already showed that their temporary-ID requirements can differ.

## Proposed next steps and decision gates

1. **Agree on the semantic contract before implementing a field kind.**
   Decide position versus item-index meaning, affinity, removal and replacement policy, supported numeric range, and whether array moves are in scope.
   State whether operations are supplied by an application or coupled to SharedTree array edits.
   Resolve these choices with the user rather than treating this note as approval.
2. **Run a small changeset-algebra experiment.**
   Define operation coordinates and candidate compose, rebase, invert, and rollback behavior.
   Start with a pure numeric reference model and short edit histories rather than wiring schema factories or persistence.
   Use the counter implementation as prior art, not as an assumed algebra.
3. **Test the difficult cases before integrating.**
   Cover insertion ties, both removal boundaries, positions inside removals, zero-length edits, overlapping removals, replacement, and multiple concurrent edits.
   Check equivalent rebased histories for convergence and composition against sequential application.
   Check undo after remote edits and preservation of information needed to undo collapsed locations.
   Use small exhaustive or generated cases in addition to hand-written examples.
4. **Assess reuse and cost from the evidence.**
   Determine whether numeric-leaf storage and the existing modular extensions suffice.
   Identify repair data, changeset growth, coordinate transformation, and any array association requirements.
   Stop for consultation if the model requires stable element identity, a new shared-layer architecture, or a significant compatibility change.
5. **Only then propose an integrated proof of concept.**
   Reuse appropriate accessor, validation, and field-handler infrastructure without building a speculative plugin framework.
   Apply the [field-kind extension checklist](./counter-field-kind-poc.md#adding-the-next-kind-extension-checklist).
   Include hydrated/unhydrated editing, events, lifecycle, minimization, persistence, and an explicit format strategy.

The immediate deliverable should be a small, tested semantic model and a written assessment of its limits.
A successful experiment would show that the proposed operations support the agreed sequential, concurrent, and undo behavior with an understandable representation.
A useful negative result would identify a minimal counterexample or a concrete requirement for more context or identity.
Neither outcome requires committing to a production API first.
