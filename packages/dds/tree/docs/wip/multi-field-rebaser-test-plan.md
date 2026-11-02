# Production-backed multi-field rebaser tests

## Status and goal

This document records the implementation plan and incremental progress checkpoints.
The full plan is not yet implemented.
Create a separate exhaustive test suite that uses production code to author changes and maintain tree state.
This is additive work: leave all existing axiom suites, generators, adapters, shared harness implementations, test registrations, skips, and execution settings untouched.
Do not replace, migrate, refactor, or remove existing tests, even where the new suite overlaps their coverage.
Generate histories that touch optional, required, and sequence fields, including moves between different sequence fields.
Internal, alpha, beta, and public APIs are all acceptable.

Target `SharedTreeChangeFamily` and its complete changeset type for the compose, invert, and rebase axioms.
The current source names that type [`SharedTreeChange`](../../src/shared-tree/sharedTreeChangeTypes.ts), not `SharedTreeChangeset`; this plan uses the existing name.
Use the existing changeset-level laws as a reference, but implement the new suite through the SharedTree family rather than the modular family.
Do not reduce the new suite to only checkout merge tests or final-content comparisons.
Existing single-field and specialized low-level tests continue to run unchanged alongside it.

## Current infrastructure

- [The optional-field generator](../../src/test/feature-libraries/optional-field/optionalChangeRebaser.test.ts) constructs field edits and wraps them in modular changesets.
  It manually tracks attached content, detached nodes, and undo metadata.
  Its nested edits deliberately force a shallow optional changeset rather than allowing a generic changeset.
- [The enumeration utilities](../../src/test/exhaustiveRebaserUtils.ts) represent histories through `FieldStateTree`, `ChildStateGenerator`, and `NamedChangeset`.
  They allocate synthetic revision labels and have no resource-disposal contract.
- [The axiomatic suite](../../src/test/rebaserAxiomaticTests.ts) enumerates histories and compares different compose and rebase paths.
  It materializes edit sequences and uses serialized initial content in test names.
- [The default-field test adapter](../../src/test/feature-libraries/default-field-kinds/defaultChangesetUtil.ts) binds the modular rebaser for this suite.
  Despite its name, its `defaultFamily` is a `ModularChangeFamily`.

The new infrastructure avoids handwritten changeset construction and state-transition bookkeeping without changing the existing infrastructure.
Give the new suite its own SharedTree axiom adapter instead of using or changing `defaultFieldRebaser`: extracting modular payloads would test the wrong abstraction boundary.
Small test-only components for enumeration, operation descriptions, assertions, and cleanup will still be necessary.

## Recommended architecture

### 1. Use a production checkout as the state authority

Represent each active exploration state with a `TreeCheckout` and a description of the history that produced it.
Use its forest, schema, branch history, and removed-root handling instead of an independent attached/detached model.

Use [the existing checkout fixture helpers](../../src/test/utils.ts), such as `checkoutWithContent`, for initialization.
Specifically, `checkoutWithContent` initializes schema and forest before constructing the checkout, without adding setup edits to the tested history.
Assert that initialization leaves only the root sentinel commit; do not assume a view's initialization API has the same history behavior.
Keep the initial schema fixed for each suite; schema-change generation is outside the first implementation.

For each candidate operation:

1. Fork the parent checkout.
2. Resolve the operation's targets against that fork's current state.
3. Execute the operation through the production editor.
4. Capture the complete committed `SharedTreeChange` and its revision.
5. Enumerate descendants while the child checkout is alive.
6. Dispose the child checkout and any retained revertibles in a `finally` block.

Never mutate the parent while enumerating sibling operations.
Do not use undo as an exploration reset mechanism: undo is itself an edit and changes history.

### 2. Use production editors to construct changes

Use `TreeCheckout.editor`, backed by [DefaultEditBuilder](../../src/feature-libraries/default-schema/defaultEditBuilder.ts), for the initial implementation.
It supports optional-field set/clear, required-field set, sequence insertion/removal, and sequence moves.
It is lower-level than the schema-aware view API, but avoids manual construction of field-kind changesets.

Keep operation descriptions independent of this editor so a schema-aware view adapter can be added later if useful.
Do not make a high-level view mandatory merely to generate SharedTree changesets.
`SharedTreeEditBuilder` already supplies the complete `SharedTreeChange` envelope around the data edits authored by `DefaultEditBuilder`.

Enumerate serializable operation descriptions, such as:

- Set or clear an optional field.
- Replace a required field's content.
- Insert into or remove from a sequence field.
- Move a range within a sequence field or between two sequence fields.
- Edit a nested field of an attached node.
- Undo a selected retained edit, and subsequently redo it.

Each description identifies field targets, indices, counts, and content labels.
Derive preconditions from the current checkout, including field lengths and optional-field emptiness.
The low-level editor does not provide complete schema or bounds validation.
Resolve the stored field schema before selecting an editor, check allowed content types and multiplicity, and include schema-declared empty fields in enumeration.
Required replacement uses `valueField(path).set(chunk)`; optional set/clear uses `optionalField(path).set(chunkOrUndefined, wasEmpty)`.
Set content must contain exactly one top-level node; an empty chunk does not mean optional clear.
Resolve paths again after every edit, not only after moves.
Release or clear forest subscription cursors before editing.
Use stable content labels to identify intended nodes in diagnostics and semantic assertions.

Invalid candidate parameters should be excluded by explicit enumeration rules.
Do not catch arbitrary editor failures and silently discard those cases: they may expose a bug.

### 3. Capture production changes without rewriting their identities

[SharedTreeEditBuilder](../../src/shared-tree/sharedTreeEditBuilder.ts) wraps data edits in a `SharedTreeChange`.
For a checkout-backed operation, record the branch head before editing and read the new head after the operation completes.
Pass the entire `head.change` and committed revision to the axioms as a `TaggedChange<SharedTreeChange>`.
Do not extract `innerChange`, cast to `DefaultChangeset`, or unwrap/re-wrap changes around algebraic operations.
The initial generated histories are data-only, so validate that shape as a fixture invariant, not as the adapter's changeset type.
Preserve the ordered `changes` list, including its discriminants, even when it contains only one data entry.

Establish an explicit one-intention/one-commit contract.
Use a checkout transaction when an intention requires multiple editor calls, and capture only after the outer transaction commits.
Assert the commit shape and count instead of accidentally capturing only the last edit.
Handle operations that produce no commit explicitly, and distinguish them from explicit no-op changes that do produce a commit.
Require no open transaction at capture boundaries.
If the head object is unchanged, fail the operation; otherwise require `after.parent === before`.
Every candidate must submit exactly one commit, so captured changes never use `undefined` to represent no submission.
For generated edits used in rollback axioms, also check that each data entry's modular revision metadata contains exactly one revision.
This remains a precondition of rollback inversion delegated by `SharedTreeChangeFamily`, not a reason to run inversion directly on modular changes.
Transactions reuse one revision for their steps, whereas manually composing independently authored edits does not establish this invariant.
Transactions update local state during execution; their single committed result does not imply hidden intermediate local states.

Use the fixture's matched ID compressor, revision minter, and revision codec.
Keep human-readable intention numbers and branch labels separate from production revision identities.
Do not retag only the outer changeset: nested identities can also refer to revisions.
Arrange allocation so concurrent histories share their base but do not accidentally reuse edit identities.
Use one compressor per exploration fixture, shared by its checkout forks with the revision minter, codec, and change family.
Independently authored edits allocate distinct revisions; transaction steps deliberately share one.
When supplying a custom compressor, use a matching content-chunk construction path: the generic JSON chunk helpers use the global test compressor.

The checkout `changed` event's `getChange()` supplies serialized change data, not a raw `SharedTreeChange`.
Prefer post-operation branch-head capture for this adapter.
If a standalone editor adapter is added, construct it through `SharedTreeChangeFamily.buildEditor` and preserve the complete tagged argument supplied to its receiver.

### 4. Separate enumeration from the axiom runner

Introduce a history-source abstraction that produces immutable `NamedChangeset<SharedTreeChange>` sequences plus a stable initial-state description.
Keep live checkouts and revertibles out of the sequences retained by the axiom runner.
Preserve changeset data needed after checkout disposal, and verify that lifetime assumption with adapter tests.
Here, immutable means logically immutable: changesets can contain `TreeChunk` objects whose reference counts change.
Do not deep-freeze their implementation state or release borrowed chunk references without an ownership contract.

Create a new suite entry point and dedicated history-source and axiom-runner modules in separate files under the SharedTree tests.
Do not adapt the existing suite or change its entry points or shared helpers.
Reuse existing exported types or pure helpers only as-is when their contracts fit; otherwise implement the required behavior in new modules rather than refactoring existing tests.
Give the new source and runner production-compatible allocation for generated, empty-change, and rollback revisions.
The existing runner creates `"empty"` and `rollback-...` string tags outside the history generator; leave that implementation untouched and do not copy this behavior into the new runner.
Those tags are tolerated by the rebaser comparator but are not valid non-root tags for the production revision codec.
Reuse the same allocated rollback changes across alternative comparison paths rather than minting different identities for equivalent computations.
If the generic runner needs `inlineRevision`, implement it through `SharedTreeChangeFamily.getRevisions` and `changeRevision` with an appropriate revision replacer, not through the old modular adapter.
Do not rewrite production-authored changes just to give them readable test names.

Use explicit fixture names and operation traces for test titles rather than serializing a checkout object.
Keep assertion logic independent of how histories are generated.

### 5. Bind the axioms to SharedTreeChangeFamily

Add a SharedTree-specific adapter for the new suite's axiom runner using a `SharedTreeChangeFamily` configured with the fixture's revision codec, field-batch codec, collaboration options, and compressor.
Use the production family itself for algebraic calls, without an error-mitigation wrapper that could turn failures into empty changes.
Leave the existing modular adapter and all of its callers unchanged.

The [SharedTree family implementation](../../src/shared-tree/sharedTreeChangeFamily.ts) supplies these operations:

| Harness operation | SharedTree-family binding |
| --- | --- |
| Compose | `family.compose(taggedChanges)` on complete SharedTree changes; a binary harness entry point passes a two-element array. |
| Invert | `family.invert(taggedChange, isRollback, revision)` with a defined production revision. |
| Rebase | `family.rebase(change, base, revisionMetadata)` with the metadata from the full comparison path. |
| Rebase over composition | Compose the complete base changes through the family, then rebase over that result without extracting data entries. |
| Empty change | `SharedTreeChangeFamily.emptyChange`, whose representation is `{ changes: [] }`. |
| Revision handling | `family.getRevisions` and `family.changeRevision`; retain rollback relationships and original revision ordering in the harness metadata. |

The family implements `ChangeRebaser<SharedTreeChange>` and exposes itself through `rebaser`.
It accepts `RevisionMetadataSource` for rebasing; do not make a modular-only metadata interface part of the new history-source contract.
Retain original edit metadata when composing histories: an anonymous composed outer tag is not a replacement for the revisions in that history.

Use the existing generic law implementations as references and reuse exported helpers only without modification where suitable.
Implement any required adaptations in the new runner, including SharedTree-specific equality, equivalence, and emptiness assertions.
Do not simply wrap calls to `defaultFieldRebaser` in a SharedTree envelope.
A spy or adapter-routing test should verify that compose, invert, rebase, and rebase-over-composition all call the SharedTree family.

The first exhaustive operation vocabulary remains data-only and fixed-schema.
That limits generated coverage, not the abstraction under test.
Add focused tests in the new suite for empty envelopes, composition of data runs around schema entries, inversion ordering, and schema-conflict behavior as needed.
Leave the existing SharedTree-family tests untouched.
Do not apply the data-only algebraic laws indiscriminately to schema-edit histories: the current family returns an empty change for nonempty concurrent changes when either contains a schema edit.
Existing [SharedTree family tests](../../src/test/shared-tree/sharedTreeChangeFamily.spec.ts) document this behavior and include skipped coverage that must not be silently treated as passing.
Exhaustive schema-change generation remains a separate extension requiring its own law preconditions.

### 6. Use production undo and explicit resource ownership

Acquire revertibles synchronously through the checkout `changed` event when an operation is eligible for undo.
Use the acquisition pattern in `createTestUndoRedoStacks` from [the test utilities](../../src/test/utils.ts), not its cleanup loops unchanged.
Assign one listener ownership of acquisition: the factory is usable only during the event and only once per commit.
Keep one canonical source handle alive while exploring its descendants.
Clone that handle at most once per revision onto the particular child performing undo, then revert outside the event callback and outside any transaction.
The target must contain the same commit object in its ancestry; equivalent content or a matching revision after history rewriting is not sufficient.
Do not rely on clone-of-clone behavior after the original source handle is released.
Acquire the revertible for the resulting undo commit to implement redo; retaining the original inverse with `revert(false)` does not turn it into redo.
Capture the resulting commit like any other generated operation.

Define ownership for listeners, revertibles, checkouts, and any views or cursors.
Account for generator cancellation, early termination, and assertion failures.
Avoid retaining all exploration forks during test discovery.
Treat rollback inverses used by the algebraic axioms separately from user-facing undo operations.
Explicitly dispose valid cloned handles before disposing their checkout: current clone registration is not included in the map that checkout disposal purges.
Drain owned handle collections or iterate snapshots because disposal callbacks can remove entries from those collections.
Disposal is not idempotent, so avoid disposing handles already released by `revert()`.
Finish or abort transactions before forking or undoing, and provide cleanup for exceptions rather than assuming a transaction callback restores state automatically.

## Cross-field fixtures and coverage

Start with a small root object containing two sequence fields, one optional field, and one required field.
Use an explicit stored-schema fixture with direct sequence fields for this first layout.
If a later fixture uses `SchemaFactory` arrays, its object properties contain array wrapper nodes; the actual sequence field is the wrapper's `EmptyKey` field.
Use stored field keys, which can differ from view property names, and a dedicated required-field schema rather than JSON-domain object properties.
Use compatible node types in the sequence fields so a node can move between them.
Give movable nodes a nested editable field and a unique content label.

Add a second fixture with sequence fields under different parent nodes.
This exercises ancestor-path handling as well as moves between sibling fields.
Keep field lengths and nesting depth small enough for bounded exhaustive enumeration.

The production operation is `editor.move(sourceField, sourceIndex, count, destinationField, destinationIndex)`.
Both fields must be sequence fields; this is not a general move between arbitrary field kinds.
Destination indexing is relative to the pre-move state.
Validate safe-integer indices/counts, source range bounds, destination gap bounds, allowed destination types, and that the destination is not inside a moved subtree.
Resolve both endpoints before the call; do not duplicate the builder's internal adjustment of destination ancestry after detachment.
Same-field destinations inside the source range are legal and can leave visible content unchanged.
Zero-count moves submit nothing, while positive-count moves with unchanged visible content can still submit a change.
Follow the cross-field move examples in [the checkout editing tests](../../src/test/shared-tree/editing.spec.ts).
Generate one atomic move, not a remove followed by an insert, so the test exercises identity-preserving move behavior.

Include these cases:

| Area | Cases |
| --- | --- |
| Basic moves | Both directions; empty and populated destinations; beginning and end positions; single-node and bounded multi-node ranges |
| Paths | Same field, sibling fields, and fields under different parents |
| Concurrent edits | Insert/remove at source or destination; edit the moved node; competing moves of the same node |
| Sequential edits | Move then edit; edit then move; move back; move a node again to a different destination |
| Mixed field kinds | Sequence move combined with optional clear/set or required replacement, including nested edits |
| Ancestor interactions | Remove or replace a parent containing a move source or destination in the concurrent history |
| Inversion | Undo/redo of a move and rollback inverses within existing sandwich-rebase axioms |

Specify expected outcomes for small targeted examples before broad enumeration.
In particular, verify that editing a moved node targets that same node and that ordinary moves neither duplicate nor lose nodes.
Do not require every moved node to remain visible after concurrent ancestor removal: removal of the destination parent can legitimately remove the moved node from visible content.

## Relationship to existing coverage

Keep the old generator and every existing suite unchanged throughout this work, not only during an initial phase.
Record coverage overlap and gaps to describe what the new suite adds, not to justify removing or relocating existing cases.
All treatments below apply only to the new suite; existing coverage remains in its original location regardless of overlap.

| Existing coverage | Proposed treatment |
| --- | --- |
| Optional set, populated clear, and empty clear | Generate through the production optional-field editor; test explicit empty clear separately from an omitted operation |
| Nested edits in attached content | Generate through production editing; existing representation-specific coverage remains unchanged |
| Undo | Use production revertibles, rather than manual detach/attach metadata |
| Optional pin | Outside the initial new vocabulary; existing low-level coverage remains unchanged |
| Standalone build without attachment | Outside the initial new vocabulary; existing coverage remains unchanged |
| Arbitrary detached-node attachment/rename | Existing coverage remains unchanged; production undo is not equivalent to this operation |
| Direct detached-node edits | Add to the new suite only after a suitable production path is demonstrated; do not change existing coverage |
| Explicit rebase versions and mixed-version histories | Add a new matrix when version selection is available; leave the existing matrix unchanged |

Do not treat `getRemovedRoots()` as a complete historical detached-node inventory.
Its contract concerns content recoverable through undo/redo.
The underlying modular builder already recognizes normalized paths carrying `detachedNodeId`.
The remaining question for direct detached edits is end-to-end identity resolution, restoration, and codec compatibility, not the absence of a production construction path.

### Rebase-version selection

[ModularEditBuilder](../../src/feature-libraries/modular-schema/modularChangeFamily.ts) currently defaults to rebase version 1 and accepts an explicit override.
`DefaultChangeFamily.buildEditor` does not expose that override, and the normal `DefaultEditBuilder` construction does not supply it.
Changing collaboration codec options alone does not currently select rebase version 2 for newly authored edits.
Decoding is different: the detached-roots codec produces version 2 changes, so an encoding round trip is not a neutral authoring-version selector.
Checkout authoring follows `SharedTreeChangeFamily.buildEditor` → `SharedTreeEditBuilder` → `DefaultEditBuilder` → `ModularEditBuilder`.
Changing only `DefaultChangeFamily.buildEditor` would not configure checkout edits.

First prove the new adapter with the current production default while retaining existing version coverage.
Then evaluate a small internal configuration change that carries version selection through the default editor and checkout construction, including forks.
Keep the normal production default and the existing test matrix unchanged; test both versions and mixed-version histories separately in the new suite when supported.
Do not post-process changesets to simulate a different rebase version.
The exact configuration surface remains an implementation decision, not a prerequisite for the initial cross-field prototype.
Support per-step version selection in the new suite, not just separate uniform-version runs, to add analogous mixed-history coverage.

## Assertions and execution bounds

Retain the enabled compose/rebase laws for the initial data-only histories, with assertion contracts explicitly lifted to `SharedTreeChange`.
Do not change existing skipped algebraic laws or their registrations as part of this additive work.
Do not weaken structural equality globally merely because new generated cases fail.
Where equivalence rather than identical representation is intended, document the comparison contract explicitly.

Define the SharedTree assertion contracts as follows:

- **Structural equality:** compare outer `revision` and `rollbackOf`, then the ordered inner-entry kinds and contents.
   Existing modular normalization helpers can compare corresponding data payloads, but must not discard the SharedTree envelope or schema entries.
   Compare schema entries, including old/new schema and inversion state, explicitly.
- **Equivalence:** retain stronger normalized data-delta checks where applicable to data-only envelopes, alongside whole-change replay checks.
   Do not flatten schema/data ordering into one modular delta or claim final-content equality proves identical change semantics.
- **Emptiness:** distinguish an empty SharedTree list from a data entry whose payload is semantically empty.
   Compose-with-inverse need not return the exact `emptyChange` representation, since composition can retain a data entry.
   Define and test an effect-based predicate for the initial data-only suite, including detached-root effects; reject unsupported schema-containing inputs rather than ignoring them.
   `getConstraintStatus` is not an emptiness predicate: it treats an empty envelope as an implicit constraint violation.

SharedTreeChangeFamily has no general-purpose `isEmpty` or equality API; these remain test assertions, not a reason to bypass the family under test.
Test any reused normalization with repeated local IDs under distinct production revisions; the old generator's shared local-ID allocator exercises a different pattern.

Source inspection found that `verifyComposeWithInverseEqualsEmpty` calls `isEmpty(changeset)` without asserting the returned boolean.
Record that existing assertion defect as an out-of-scope follow-up; do not modify the existing helper in this work.
The new runner must assert the returned boolean and include a negative test that proves the assertion fails for a nonempty result, with an audit of its emptiness predicate for multi-field changes.
Do not count the current helper's execution as proof that the inverse law holds.

Add production application checks to complement changeset assertions:

- Sequential application and composed application produce equivalent observable content.
- Alternative rebase paths agree when applied in their correct common context.
- Targeted move examples preserve the intended node and its nested edits.
- Undo/redo restores expected content in focused examples.

Use checkout-level replay of complete SharedTree results as the primary production application check.
The internal route is `checkout.mainBranch.apply(taggedSharedTreeChange, CommitKind.Default, undefined)` outside a transaction; it requires a defined outer revision.
For anonymous composed outputs, provide a fresh application revision from the fixture allocator without replacing the original nested revisions.
Use the same application revision for corresponding alternative results on separate replay forks, and do not append it twice on one history.
Replay from the correct common context, including stored schema and required detached content, not only equal visible JSON.
Compare observable content and stored schema, with explicit detached-content expectations where relevant.
Keep raw `intoDelta`/`applyDelta` replay only as a subordinate data-payload diagnostic, not as the sole oracle for SharedTree changes.
If such diagnostics are used, retain their detached-field index and release temporary delta build/refresher references in `finally`.
Do not directly mutate a checkout's forest and then treat its branch history as synchronized.

Production application is not an independent oracle for all production behavior.
Keep explicit expected outcomes for small examples so shared implementation errors do not make every comparison pass.

Bound the operation vocabulary, field lengths, move counts, nesting depth, undo depth, and history lengths per fixture.
Use small exhaustive configurations in normal continuous integration and larger configurations in stress runs.
Report operation counts, history counts, runtime, and peak live checkout counts before selecting budgets.
Do not apply existing stress depths unchanged to a much larger multi-field branching factor.
Ensure failure output includes the fixture, operation sequence, version choices, and branch labels needed to reproduce the case.

## Implementation sequence

### Progress checkpoint: change capture

The first implementation milestone adds only new test infrastructure:

- [changeGeneration.ts](../../src/test/shared-tree/axiomatic/changeGeneration.ts) forks a checkout per candidate operation and captures the complete tagged `SharedTreeChange` without extracting its modular payload.
   The generator owns each child checkout until enumeration advances or closes, and aborts unfinished transactions during cleanup.
- [changeGeneration.spec.ts](../../src/test/shared-tree/axiomatic/changeGeneration.spec.ts) contains 20 passing tests across reference and optimized forests.
   Coverage includes atomic cross-field moves, sibling isolation, revision allocation, empty-clear versus no-submission behavior, transaction capture, cleanup on failure or early exit, and replay of a build-bearing change after its authoring fork is disposed.

The tree test build, focused test run, new-file formatting check, and new-file lint check passed.
No existing test suite or shared helper was changed.
This checkpoint does not yet implement the SharedTree axiom adapter, exhaustive operation enumeration, undo/redo ownership, or broad changeset lifetime guarantees.
The current candidate callbacks are a small capture-layer interface, not the planned serializable operation vocabulary.
Pause for review before adding those layers.

### Progress checkpoint: history generation and SharedTree axioms

The second milestone adds five separate files without changing existing tests or shared helpers:

- [historyGeneration.ts](../../src/test/shared-tree/axiomatic/historyGeneration.ts) enumerates exact-length committed histories while retaining ancestor checkouts only during descendant exploration.
   Retained histories contain descriptions and complete tagged changes, not live checkouts.
- [multiFieldFixture.ts](../../src/test/shared-tree/axiomatic/multiFieldFixture.ts) supplies a fixed-schema fixture with two sequence fields, one optional field, and one required field.
   Its serializable vocabulary includes moves in both directions, sequence insertion/removal, optional set/clear, and required replacement.
   Candidate availability follows the current forest, with sequence destinations bounded to two nodes.
- [historyGeneration.spec.ts](../../src/test/shared-tree/axiomatic/historyGeneration.spec.ts) checks explicit operation outcomes, deterministic enumeration, retained-change replay, and disposal on completion, cancellation, and failure.
- [sharedTreeAxioms.ts](../../src/test/shared-tree/axiomatic/sharedTreeAxioms.ts) binds algebraic calls to the production SharedTree family and supplies envelope-aware structural comparisons, data-effect emptiness assertions, and whole-change replay checks.
- [sharedTreeAxioms.spec.ts](../../src/test/shared-tree/axiomatic/sharedTreeAxioms.spec.ts) independently registers the bounded laws and adapter contract tests.
   Coverage includes empty identities, rollback cancellation, sequential-versus-composed replay, composition associativity, rebase over composition, and focused schema-envelope behavior.

The fixture produces 7 one-edit histories, 41 two-edit histories, and 235 three-edit histories.
The rebase matrix contains 287 combinations per forest implementation.
Depth-two enumeration creates and disposes 48 exploration forks; early-exit tests verify descendant-first cleanup.
The generated changes use the editor's default rebase version 1.

Validation on 2026-11-02: the tree test build, formatting, and lint checks pass.
The focused suite, including the first milestone, reports **75 passing and 2 failing tests**, in approximately two seconds.
Both failures are the same structural rebase discrepancy, once for each forest implementation.
The checkpoint is therefore blocked, not complete or ready for CI.

The failing case starts with `left = [A]` and `right = [B]`:

1. The local edit removes `A` from `left`.
2. The concurrent history moves `B` from `right` to the end of `left`, then moves `A` from `left` to `right`.
3. Rebasing the local edit over those changes separately produces a detach in `right`.
4. Rebasing it over their composition produces the same detach followed by an additional empty-cell mark referring to the first move's revision.

A diagnostic run of all 287 reference-forest combinations found exactly one structural mismatch and no visible-content or stored-schema replay mismatches between the two rebased paths.
Matching replay does not establish equivalent future rebase behavior or detached-content identity.
The structural assertion remains enabled and unchanged; no operation was filtered out and no test was skipped.
Further investigation must establish whether the difference requires a production fix or a justified comparison normalization before this checkpoint can pass.
Pause for review before changing production behavior or comparison semantics.

Undo/redo ownership, nested editable nodes, moves between different parents, additional laws, alternate rebase versions, and stress budgets remain future work.

### Fixture revision: JSON helpers and built-in schema

At the user's request, the implemented fixtures now use `JsonCompatible[]`, `fieldJsonCursor`, and `chunkFromJsonTrees` instead of `JsonableTree` and custom stored-schema declarations.
Both fixtures use `toInitialSchema(JsonAsTree.JsonObject)`.
Assertions and replay comparisons use `expectJsonTree` and `jsonTreeFromCheckout`.

This supersedes the direct-sequence-field layout described above.
The `left` and `right` properties each contain a JSON array node; sequence edits target its `EmptyKey` field.
Cross-field moves therefore span two array parents.
JSON object properties are optional, including the property named `required`.
To retain actual required-field coverage without a custom schema, the `setRequired` operation replaces the required root object, copying the other visible property values and updating that scalar label.
This replacement creates new descendant identities; it is not an in-place update of a required scalar property.

After conversion, the build, formatting, and lint checks pass, and history counts remain 7, 41, and 235.
The focused suite still reports 75 passing tests and the same two enabled structural-rebase failures on the remove/move/move case.
No production code or pre-existing shared harness was changed.

### Capture contract revision: require a commit

Candidate callbacks must now submit exactly one commit.
`GeneratedSharedTreeChange.change` is non-optional, and history generation no longer skips candidates that submit nothing.
Such candidates fail enumeration, with cleanup of their own fork and any active ancestor forks.
Explicit empty clears remain valid because they submit a commit even when visible content is unchanged.
The affected capture and history suites pass all 66 tests across both forest implementations; build, formatting, and lint checks also pass.
The unrelated structural-rebase failures recorded above are outside this contract change.

### Implementation steps and remaining extensions

1. **Establish a baseline and coverage inventory.**
   Record the existing enabled axioms, operation families, version combinations, runtime, and known failures.
   Record the missing inverse-law assertion as an out-of-scope follow-up, and plan correct assertions and production-compatible revision allocation in the new runner.
   Leave existing suites, helpers, registrations, skips, and settings untouched.
2. **Build a minimal production-backed adapter.**
   Initialize a checkout, enumerate optional set/clear and one sequence insertion, fork per operation, capture complete tagged `SharedTreeChange` values, and clean up resources.
   Test revision preservation, commit boundaries, parent isolation, and early-exit cleanup.
3. **Introduce the SharedTree axiom adapter and history-source interface.**
   Add separate suite and support modules, bind every algebraic operation to `SharedTreeChangeFamily`, and connect the new history source without modifying existing harness code.
   Test empty-list versus empty-data representations and preserve focused schema-envelope tests without extending the exhaustive schema vocabulary.
   Verify that captured changes remain usable after exploration checkouts are disposed.
4. **Add multi-field fixtures and atomic moves.**
   First add targeted expected-result tests, then bounded enumeration across sibling fields and different parents.
   Add required and optional field interactions and nested edits.
5. **Add undo/redo and application checks.**
   Exercise retained revertibles on forks and replay complete SharedTree outputs from the relevant compose/rebase paths in valid contexts.
6. **Resolve version coverage.**
   If internal plumbing is adopted, verify that the selected version reaches edits on all forks and that mixed-version histories run through the same axioms.
   Otherwise, document the new suite's version limitation; existing version-specific suites remain unchanged in either case.
7. **Add and tune the separate suite.**
   Ensure normal test discovery includes the new suite without changing existing suite registrations.
   Run existing and new suites side by side, measure the additional cost, and tune only the new suite's budgets.
   Verify that no existing tests, generators, helpers, or coverage were removed, relocated, or modified.

## Acceptance criteria

- The new SharedTree axiom suite and its adapted support code live in separate files and run alongside the existing suites.
- Existing axiom suites, generators, adapters, shared harness implementations, registrations, skips, and execution settings remain untouched.
- Normal optional, required, and sequence edits are authored by production editors, with state maintained by production checkouts.
- The new generator does not manually construct field-kind changesets or maintain a parallel attached/detached state model.
- A single generated move changes two distinct sequence fields and preserves node identity.
- Existing enabled changeset-level laws run against bounded multi-field histories of complete `SharedTreeChange` values through `SharedTreeChangeFamily`.
- No algebraic operation in the new adapter extracts modular changes or delegates directly to `defaultFieldRebaser` or `ModularChangeFamily`.
- SharedTree-level comparisons preserve envelope structure and schema entries; data-only scope and emptiness semantics are explicit.
- Production replay checks apply whole SharedTree changes to checkouts rather than only applying extracted modular deltas.
- Captured revisions and nested change identities remain consistent across forks, undo, composition, and rebasing.
- Exploration resources are released on success, failure, and early termination.
- Existing operation and rebase-version coverage remains unchanged; the new suite documents its additional coverage and limitations.
- Normal and stress configurations have measured costs and reproducible failure traces.

## Scope exclusions

This work does not replace, migrate, refactor, or remove any existing axiom or field-kind test suite or shared test harness.
Fixes for defects found in existing test helpers are separate follow-ups and are not part of this work.
The initial implementation also does not redesign the production rebaser, add schema-change generation, or require public API additions.
It also does not promise that all low-level changeset forms are reachable through normal user editing.

## API verification record

Verified against current source and existing test implementations on 2026-10-30.
This was static inspection; no runtime prototype or test suite was executed for this verification.

| Assumption | Source evidence and result |
| --- | --- |
| Initialization without setup edits | [checkoutWithContent](../../src/test/utils.ts#L919-L952) initializes the forest before checkout construction. |
| Cross-field atomic move | [DefaultEditBuilder.move](../../src/feature-libraries/default-schema/defaultEditBuilder.ts#L320-L451) submits both field edits together; the [interface](../../src/feature-libraries/default-schema/defaultEditBuilder.ts#L169-L181) specifies pre-move indexing. |
| Post-transaction head capture | [Transaction composition](../../src/shared-tree-core/transaction.ts#L438-L559) squashes submitted steps; [location replay](../../src/test/shared-tree/locationReplay.spec.ts#L230-L257) demonstrates parent validation, data extraction, and delta reference cleanup. |
| Shared identities across forks | [TreeCheckout.fork](../../src/shared-tree/treeCheckout.ts#L1578-L1606) shares identity services and clones content/schema/removed-root state; it rejects open transactions. |
| Complete SharedTree capture | [SharedTreeEditBuilder](../../src/shared-tree/sharedTreeEditBuilder.ts#L53-L67) preserves the tag and supplies the full envelope; retain that envelope in the axiom input. |
| Target family and changeset | [SharedTreeChangeFamily](../../src/shared-tree/sharedTreeChangeFamily.ts) implements the SharedTree rebaser; [SharedTreeChange](../../src/shared-tree/sharedTreeChangeTypes.ts) is the existing changeset type name. |
| Whole-change replay | [Branch application](../../src/shared-tree-core/branch.ts#L188-L224) accepts tagged changes and requires a defined outer revision. |
| Undo ownership | [Revertible construction](../../src/shared-tree/treeCheckout.ts#L1420-L1496) and [checkout purge](../../src/shared-tree/treeCheckout.ts#L1907-L1916) require explicit clone cleanup; the [test helper](../../src/test/utils.ts#L1404-L1455) mutates arrays while its cleanup iterates them. |
| Authoring version override | [ModularEditBuilder](../../src/feature-libraries/modular-schema/modularChangeFamily.ts#L2762-L2774) defaults to version 1; [DefaultEditBuilder](../../src/feature-libraries/default-schema/defaultEditBuilder.ts#L213-L225) supplies no override. |
| Harness compatibility gaps | [Empty/inverse helpers](../../src/test/rebaserAxiomaticTests.ts#L636-L660) and [rollback helper](../../src/test/rebaserAxiomaticTests.ts#L835-L845) contain synthetic revisions and the missing inverse-law assertion. |

Before scaling enumeration, runtime adapter tests must establish post-disposal changeset usability, chunk ownership, clone cleanup, empty-clear capture, and comparison behavior with reused local IDs.
Source inspection supports the architecture but does not establish those runtime guarantees or acceptable performance.