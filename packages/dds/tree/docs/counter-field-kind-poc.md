# Counter field kind proof of concept

## Status and purpose

For conclusions from this experiment and the proposed numeric-position interpretation of array-location fields, see [From counter fields to array-location fields](./array-location-field-design.md).
That follow-up separates demonstrated counter behavior from proposed semantics and next investigation steps.

### Approved API scope change (2026-10-21)

The user explicitly approved preserving the existing homomorphic mutable `ObjectFromSchemaRecord` property map.
Counter properties expose a counter accessor, but the property itself is not compile-time readonly.
The accessor's `.value` remains readonly, and numeric property assignment remains a type error.
Assignment of another accessor can type-check, but all direct counter-property assignments must throw at runtime.
This is approved proof-of-concept debt, not an unresolved consultation gate.
The previous readonly-key-partitioning compatibility gate is closed by this scope change.
That approval authorized the API, editor, format, and end-to-end integration recorded below.

### Integration progress after approval

The native handler is now connected to hydrated/unhydrated counter editors, `MappedEditBuilder`, edit locking, and stable owner/key-bound accessors.
Object properties retain the homomorphic mutable mapping.
Root content types remain separate from object-property accessor types; cloning and persisted content are not widened to include accessors.
The original table interfaces and homomorphic object-property maps are preserved.
Fixed-leaf validation is shared by identifier and counter schema construction/reconstruction; identifier defaults and services are unchanged.
Experimental `counter|v0.1` modular/change/message/history entries are isolated from all existing dependency entries and default write selections.

The example's nested `it` declarations were corrected to `describe`, so its tests now execute.
It uses `objectAlpha`, the existing constructor API that recognizes `withDefault` fields.
Attempting to override stable `object` with that constructor return type failed TypeScript override compatibility; that attempt was removed.
After reviewing the completed integration, the user explicitly approved this `objectAlpha` deviation and the experimental changeset wording.
Its container uses the approved explicit registry/key configuration.
The data-store helper disposes the initialization view; the example therefore reacquires its node from the application view.
Retained-accessor hydration must be tested in a view that remains alive, rather than by retaining a node from a disposed view.

`pnpm --dir packages/dds/tree run build:esm` and `pnpm --dir packages/dds/tree run build:test:esm` now pass.
The first real example run uncovered a pre-existing assumption that all supported change codecs have numeric versions.
Standalone change serialization now ignores experimental string versions when choosing its default, preserving existing writes.
Standalone serialized counter changes are not yet supported; this is distinct from container message/history persistence.
The next example run correctly enforced disposed-node lifecycle semantics, prompting the application-view adjustment above.
End-to-end acceptance, old-format initialization/load rejection, API generation, and broader regression validation now pass.

The example now passes and converges to 210.
Its second client's immediate addition result is 207 (202 + 5), correcting the original example's arithmetic typo of 208.
The first acceptance run passed hydration, concurrency, remote-aware undo/redo, parent lifecycle, events, cloning/export, and explicit old-format rejection.
Two minimization tests exposed a localized rollback-ID defect in the retained counter handler:
rollback revision normalization can place newly allocated temporary IDs into the original transaction revision, where they collide with later steps' structural IDs.
Rollback now reuses the counter edit's own already-released temporary IDs; normal undo still allocates separate IDs.
Both minimized transaction scenarios then passed, without changing minimizer architecture or structural filtering.
The first reload fixture used a mock connection that intentionally rejects submissions; it was replaced with the repository's real summary/load test provider to verify collaborative edits after reload.

#### Generic content/API audit

A proposed separate object-property mapping compiled the package but failed the explicit existing generic noncounter read/set example.
That approach was removed; no readonly mapping was attempted.
`TreeFieldFromImplicitField` now correctly includes counter accessors, while `TreeRootFromImplicitField` describes raw root content and excludes the unsupported counter root kind.
Tree view root getters and create/import APIs use the root type.
Cloning has a raw-value-preserving overload and an explicit-schema overload constrained to raw content.
A shared runtime assertion narrows generic content before cloning; no accessor is added to persisted content, and the clone implementation no longer needs its former return cast.
The original table property interfaces are unchanged.
The preserved generic noncounter read/set example is now a compiled regression test.
The broad field-schema type test explicitly includes `TreeCounter`.
One existing generic hydration test helper needs an explicitly typed raw-root intermediate to preserve TypeScript's schema relationship; no unsafe cast is added.

An intersection-based raw-root type triggered an existing post-schema-change narrowing error.
An `Extract`-based variant triggered additional generic narrowing errors.
The retained per-kind raw-root mapping avoids both: source and all test declarations compile, including generic object setters, recursive schemas, and existing clone/export consumers.
These are content-versus-accessor type refinements, not reopening the approved readonly-property limitation.

The acceptance suite now uses the repository test hooks and real on-demand summarization.
Summary/reload followed by concurrent new edits passes.
The first broad regression selections passed 556 and 735 tests respectively (the latter with four pre-existing pending tests).
The expanded regression selection subsequently passed 2,511 tests with seven pending tests after the type-audit changes.
Codec enumeration tests now explicitly cover the new experimental versions.
The change-codec schema snapshot adds only the experimental entry; stable entries remain unchanged.
The repository snapshot runner initially removed unrelated snapshots when run with a filter; those deletions were restored immediately.

Focused implementation-design investigation completed on 2026-10-21 against baseline commit `d4a6453b35f`.
Implementation was authorized on 2026-10-21 after the focused design consultation.
The historical API compatibility gate below was resolved by the approved runtime-only property-assignment restriction.
End-to-end integration is implemented; the final acceptance and validation record is at the end of this report.
The counter handler is registered for schema policy and change processing, but only isolated experimental format entries encode it.
Existing format entries and default write selections do not enable counters.
This document describes an experiment, not a supported feature or a release commitment.
Update it throughout the experiment, including failed approaches and decisions that change.

The experiment should answer:

- Can a native counter field kind provide the API in the [counter example](../src/test/counter.integration.ts)?
- What changes are needed across schema, editing, storage, collaboration, and the application-facing API?
- Which changes are specific to counters, and which prepare SharedTree for other field kinds?
- What does this reveal about a future field kind for extrinsic array locations, without implementing that feature?

## Proposed acceptance contract

The object-field-first, end-to-end scope and JavaScript-number arithmetic have been agreed.
The detailed contract below is the approved implementation target.

- Support `SchemaFactoryAlpha.counter(SchemaFactory.number, props?)`.
- Accept numeric constructor input, but expose a counter accessor when reading the field.
- Expose a readonly `.value` and `.add(delta)`, returning the new local value synchronously.
  The return value is not a promise about the value after concurrent edits arrive.
- Preserve `withDefault(..., 0)` and stored-key behavior from the example.
- Without a default, require an initializer rather than silently initializing to zero.
- Support the same API before and after hydration, including an accessor retained across hydration.
- Concurrent additions must accumulate rather than overwrite one another.
- Undo an addition by removing its contribution, without undoing another client's addition.
  Test redo and transaction rollback as well.
- Summarize and reload a document without losing counter state or the ability to make further collaborative edits.
- Reject unsupported operations and input explicitly, using normal repository error handling.

Open semantic questions:

- Is direct assignment to the field or its `.value` always forbidden after construction?
- What should a retained accessor do after its owning node is removed, restored, or disposed?
  Prefer existing node lifecycle conventions where applicable.

Agreed arithmetic scope: use ordinary JavaScript numbers.
Only guarantee consistent behavior in cases where JavaScript arithmetic is itself consistent.
Do not add exact arithmetic, restrict the API to safe integers, or make floating-point edge cases a prerequisite project.
Use exactly representable arithmetic for collaboration and undo acceptance tests, and document the limitation rather than claiming unconditional convergence.
Input validation details, including treatment of non-finite numbers, should follow existing numeric conventions where applicable and be recorded.

## Scope and non-goals

Agreed coverage: object fields first, integrated end to end.
Recommended implementation: a native field kind, not a sequence-backed counter presented under a new API name.
An adapter backed by existing field kinds could demonstrate API ergonomics, but would not answer the main extensibility question.

Include focused tests for types, local edits, hydration, collaboration, undo/redo, transactions, events, and persistence.
Exercise counter edits alongside ordinary fields and parent movement/removal.
Record support or explicit limitations for schema conversion, inspection, cloning, and serialization APIs encountered along the path.

Do not implement extrinsic locations, a general third-party field-kind plugin API, production migrations, or a broad architectural cleanup.
Do not repair the example's sequence-based counter unless it is necessary to run the native-counter experiment.
Do not equate this proof of concept with production readiness or mixed-version compatibility.

## Maintainability across field kinds

Treat the cost and reliability of adding subsequent field kinds as an explicit experiment outcome.
The goal is reusable internal extension points, not a public plugin framework or implementation of speculative kinds.

Separate concerns that happen to coincide in the first examples:

- Allowed content, including a specific leaf schema where required.
- Multiplicity and initialization/default policy.
- Constructor input, property read representation, assignment policy, and editing API.
- Collaborative semantics, persisted kind identity, and codec format version.

A fixed leaf type does not imply immutability, an automatic default, or a particular accessor API.
Likewise, immutable optional or required fields need not be restricted to a specific leaf type.
Do not collapse these concerns into a single special-case category or inheritance hierarchy.

Use identifier and counter fields as the two concrete cases for evaluating shared fixed-leaf schema construction and validation.
Preserve identifier-specific default generation and identifier tracking rather than treating them as properties of all fixed-leaf fields.
Preserve the proposed explicit `counter(SchemaFactory.number, props?)` API while evaluating shared implementation.
Reject incompatible allowed types through both the supported TypeScript API and runtime validation where needed.
Trace schema conversion paths as well as the primary factory so the restriction is not enforced in only one entry point.

Investigate common field-read dispatch for normal property access and property descriptors, and consistent edit restrictions across hydrated and unhydrated access.
Prefer small shared helpers or explicit typed mappings supported by actual callers.
An explicit per-kind mapping is acceptable; the goal is to avoid repeated policy logic and overlooked integration sites, not to eliminate every switch.
Any modular change-pipeline extension should express the needed capability, such as field-generated replacement content, rather than contain a counter-specific branch.

Keep persisted semantic identity separate from implementation reuse.
Two kind identifiers may share helpers or change-processing code without becoming interchangeable in stored schema.
A semantic successor must not silently change an existing kind's interpretation, and a codec version alone does not establish semantic compatibility.
Document upgrade policy separately from both code sharing and representation similarity.

Before implementing a shared-layer refactor, present its scope under the existing consultation rule.
Use identifier regression tests as evidence for any shared path, including defaults, readonly behavior, and identifier-specific services.
Do not migrate unrelated kinds merely to make an abstraction appear general.
At the end, record a concrete "adding the next kind" checklist, remaining duplicated policy, and justified opportunities for later extraction.
Assess future immutable fields, location-related fields, and semantic successor versions on paper; do not add dummy production kinds.

## Initial observations

These observations come from source inspection, not executed tests.

| Area | Evidence | Implication |
| --- | --- | --- |
| Change processing | [FieldChangeHandler](../src/feature-libraries/modular-schema/fieldChangeHandler.ts) includes composition, inversion, rebasing, codecs, delta conversion, and removed-root handling. | A native kind must participate in the existing change pipeline, not just expose an editor. |
| State application | [Delta](../src/core/tree/delta.ts) already supports replacing a single node. A counter can have the same forest representation as a required numeric field. | Keep additive intent in the counter changeset and lower the rebased result to an ordinary replacement. The absence of a numeric-update delta does not itself require delta or forest changes. |
| Replacement content | [Modular delta conversion](../src/feature-libraries/modular-schema/modularChangeFamily.ts) currently sources builds from the outer modular changeset. [FieldChangeDelta](../src/feature-libraries/modular-schema/fieldChangeHandler.ts) exposes local changes, global changes, and renames, but not builds. | Investigate how a field kind supplies replacement content whose value changes during rebase. This may require a modular integration extension, not a new delta primitive or forest representation. |
| Registration and compatibility | [Default field kinds](../src/feature-libraries/default-schema/defaultFieldKinds.ts) have both a supported-kind registry and version-specific codec configurations. [Field-kind policy](../src/feature-libraries/modular-schema/fieldKind.ts) requires stable interpretation of identifiers. | Registration, format support, schema compatibility, and feature enablement need separate attention. |
| Application-facing types | [Field schemas](../src/simple-tree/fieldSchema.ts), [object nodes](../src/simple-tree/node-kinds/object/objectNode.ts), and [stored-schema conversion](../src/simple-tree/toStoredSchema.ts) contain kind-specific handling. | Constructor input, property reads, property writes, and stored schema must agree on the new kind. |
| Defaults | [Alpha schema factory](../src/simple-tree/api/schemaFactoryAlpha.ts) types defaults in terms of insertable field content. | Numeric input with a counter accessor as output appears compatible with the intent of this API, but needs compile-time verification. |
| Example harness | The [example](../src/test/counter.integration.ts) nests `it` calls inside other `it` callbacks. | Restructure the test suites before treating the example as executed acceptance evidence. |

The sequence-based example also contains assumptions about transaction rejection and an intentionally invalid-looking transaction return value.
These are investigation leads, not confirmed SharedTree bugs.
Keep them separate from counter implementation defects.

## Implementation milestones and gates

### 0. Agree on the experiment

The user selected JavaScript-number arithmetic, object-field-first end-to-end coverage, and preservation of existing behavior/formats with consultation on shared-layer design changes.
Confirm any remaining contract questions and the proposed native-kind approach.
Only start implementation after explicit approval.

### 1. Establish the baseline and verify replacement-based lowering

Record relevant baseline build/test failures, distinguishing the deliberately noncompiling example from unrelated failures.
Trace one addition through editing, changesets, delta application, forest state, notifications, and summaries.
Start with one numeric child in the forest, as for a required numeric field, and ordinary replacement deltas.
Investigate a counter changeset carrying additive intent and sufficient contextual value information for state-independent delta conversion.
Verify how composition, inversion, and rebasing maintain that information and how the resulting replacement content and detached-node IDs enter the modular change pipeline.
Evaluate convergence, invertibility, and retained-state growth within this design before considering other representations.
Map existing identifier handling alongside the counter path to identify concrete sharing opportunities and intentional differences.

Deliverable: a short design decision in this report with rejected alternatives and expected affected layers.
Consult before proceeding if this requires a new delta primitive, a changed forest invariant, or an unbounded contribution history.
Do not choose a representation solely because it makes the example pass.

### 2. Implement and verify change semantics

Implement the field kind, change handler, codec, and replacement-delta integration.
Test composition, inversion, rebasing, codec round trips, and empty changes within the agreed arithmetic scope.
Use existing field-kind test helpers where applicable.
Keep ordinary field behavior unchanged.

### 3. Connect the schema and application-facing API

Wire schema factories, type mappings, construction/defaults, stored keys, hydrated and unhydrated access, and events.
Implement approved, bounded sharing with identifier fields where both are genuine users, keeping kind-specific defaults and editing behavior separate.
Use negative type tests and runtime tests for unsupported schema types and assignments.
Preserve the example's API unless an agreed design change is recorded.
Regenerate API reports through the existing build tooling if needed; never edit them by hand.

### 4. Verify the integrated behavior

Run the example as a real discovered test.
Test concurrent positive and negative additions with controlled delivery, including the example's final value of 210.
Test undo/redo after remote additions, aborted transactions, branches/rebasing, parent lifecycle interactions, and accessor lifetime.
Test summary/load followed by further collaborative edits.
Run focused existing regressions for each changed shared layer.
For any shared identifier/counter path, verify identifier behavior and both ordinary property reads and property-descriptor reads.

### 5. Assess practicality and remaining work

Report the implementation footprint, observed limitations, and required production work.
Separate reusable preparation for future field kinds from counter-specific arithmetic and storage work.
Document the extension checklist and assess whether another fixed-leaf kind or a semantic successor could reuse the new code without copying policy across layers.
Make no claim that counter success proves extrinsic-location feasibility: identity, position tracking, and cross-field dependencies need their own investigation.

## Consultation and stopping rules

Preserving existing behavior/formats and consulting on shared-layer design changes are agreed.
The following detailed rules implement that budget:

- Proceed independently on local implementation details that preserve the agreed contract.
- Stop before changing the proposed API, arithmetic semantics, merge behavior, undo behavior, or supported initialization model.
- Stop before breaking existing API/behavior or changing the interpretation of an existing persisted format.
- Stop before introducing a major shared-layer redesign, an unbounded-state workaround, or a new dependency.
- Stop if the next useful step becomes a substantial prerequisite project rather than counter implementation.
- Record unrelated bugs and continue unless they block the experiment; propose blocking fixes before expanding scope.
- Never weaken convergence assertions, suppress type errors, or silently drop required behavior to claim completion.
- A blocked experiment is a valid outcome when supported by concrete evidence and options for the next step.

## Decision history

Append entries rather than rewriting away earlier decisions.
For each entry, record the date, status, rationale, alternatives, and evidence.
When a decision changes, identify the superseded decision and the cost of changing direction.

| ID | Status | Decision | Rationale |
| --- | --- | --- | --- |
| D1 | Proposed | Implement a native field kind rather than an adapter over a sequence. | Exercise the actual extension boundaries. |
| D2 | Proposed | Preserve numeric input and expose a field accessor for reads and edits. | Test the central API distinction in the supplied example. |
| D3 | Agreed, 2026-10-21 | Use ordinary JavaScript numbers; guarantee consistency only where their arithmetic is consistent. | The user explicitly chose not to make numerical nuances a focus of this experiment. This resolves the earlier representation/overflow investigation proposal without introducing stronger arithmetic guarantees. |
| D4 | Agreed budget; gating design open, 2026-10-21 | Preserve existing behavior/formats and consult before shared-layer design changes. | Avoid accidentally claiming compatibility with clients that do not implement counters. |
| D5 | Agreed, 2026-10-21 | Object-field-first end-to-end coverage. | Include collaboration, undo/redo, transactions, events, hydration, and persistence rather than only compiling the example. |
| D6 | Revised working design, 2026-10-21 | Reuse required-field-shaped forest state and ordinary replacement deltas; keep additive semantics in counter changesets. | The user pointed out that counters do not require numeric-update deltas. This corrects the initial emphasis on missing numeric-update support. The remaining integration question is how to supply replacement content computed by rebasing through the modular field-kind interfaces. |
| D7 | Goal agreed; extraction details proposed, 2026-10-21 | Evaluate maintainability across future kinds and use identifiers plus counters to ground shared fixed-leaf support. | The user identified likely future kinds and semantic successor versions. Prefer bounded internal reuse while keeping allowed content, defaults, API representation, merge semantics, and persisted identity independent. |
| D8 | Proposed, 2026-10-21 | Materialize counter results with temporary builds, replacement marks, and immediate destruction of the old leaf. | Both existing forests support this sequence. Avoid retaining historical numeric leaves or treating undo as restoration of the original leaf identity. This refines D6 without changing forest or delta interfaces. |
| D9 | Proposed, 2026-10-21 | Extend field delta output and distinguish value-edit filtering from structural repair filtering. | Computed replacement content and transaction minimization are concrete gaps in the current extension interface. Keep extensions capability-based, not counter-specific. |
| D10 | Proposed, 2026-10-21 | Cache the counter accessor by owning Simple-tree node and stored key; resolve its current inner field on every operation. | A cached unhydrated FlexTree field cannot be the accessor's permanent backing state across hydration. |
| D11 | Proposed, 2026-10-21 | Use an explicit experimental format configuration without modifying existing format dependency mappings. | The registered kind sets are version-specific and existing parent-format dependencies are documented as immutable. This requires an explicit configuration addition to the example, not a change to its field API. |
| D12 | Approved, 2026-10-21 | Proceed with D1–D2 and D8–D11, bounded fixed-leaf sharing, and atomic value-edit minimization. | The user authorized the native end-to-end implementation, including the explicit example format configuration. This supersedes the earlier pending-authorization statements in the historical investigation below. |
| D13 | Consultation required, 2026-10-21 | Do not ship the attempted counter-only readonly object mapping. | Both direct key partitioning and a materialized mapping break existing generic object subclasses in `tableSchema.ts` with TS2509. Changing those callers would not preserve equivalent downstream API usage. Keep the validated modular stage while resolving this compatibility choice. |

## Focused investigation: proposed implementation design

### Findings and confidence

The source build passes.
The test build fails only in the supplied counter example, with eight diagnostics.
Five focused existing test files pass, totaling 431 tests.
The executable forest probe below demonstrates the replacement mechanics; it does not implement a counter handler or prove collaboration, undo, events, or persistence.

| Finding | Evidence | Consequence |
| --- | --- | --- |
| Required-field edits build content before submitting their field changeset. | [DefaultEditBuilder.valueField](../src/feature-libraries/default-schema/defaultEditBuilder.ts) submits a global build and a field replacement referencing its ID. | Copying this editor and only changing its merge policy is insufficient: the replacement content can change during counter rebase. |
| Modular rebase keeps global builds unchanged. | [ModularChangeFamily.rebase](../src/feature-libraries/modular-schema/modularChangeFamily.ts) returns `builds: change.builds`. | Store the numerical context in the counter changeset and materialize the resulting leaf during delta conversion instead. |
| Field delta results cannot currently supply builds or destructions. | [FieldChangeDelta](../src/feature-libraries/modular-schema/fieldChangeHandler.ts) exposes local changes, global changes, and renames. | Add optional build/destroy outputs and aggregate them with existing outer outputs, including recursively nested fields. |
| Temporary replacement storage can be completely removed. | [visitDelta](../src/core/tree/visitDelta.ts) builds first, detaches, attaches, and finally destroys; attachment removes the source index entry. The probe passes in both forests. | No new delta primitive or forest mutation operation is indicated. Old counter leaf identity would intentionally not survive the replacement. |
| Reusing a build ID while its previous tree remains detached is invalid. | `buildTrees` in [visitDelta](../src/core/tree/visitDelta.ts) asserts that the ID does not already exist. | Temporary IDs must not escape delta application. Simply regenerating a different leaf under an ordinary retained build ID is not a valid strategy. |
| Ordinary modular destructions are reserved for rollback. | [invertModularChange](../src/feature-libraries/modular-schema/invert.ts) rejects inversion of a changeset containing global destructions. | Counter cleanup must be derived in delta output, not placed in normal `ModularChangeset.destroys`. |
| Minimization classifies edits using structural callbacks and drops other edits in both partitions. | [ModularChangeMinimizer](../src/feature-libraries/modular-schema/minimizeModularChange.ts) passes `preserveOtherEdits: false` for build squashing and residual changes. | A counter handler that follows that flag would lose additions. A handler that ignores it would break muting or apply edits to the wrong minimization partition. |
| Existing summary encoding already supports ordinary single-child kinds. | [getFieldEncoder](../src/feature-libraries/chunked-forest/codec/schemaBasedEncode.ts) selects an ordinary node encoder for non-identifier `Multiplicity.Single` fields. | Counters should need registry/schema integration, not a new numeric summary encoding. Identifier compression remains a separate special case. |

### Counter changeset and merge model

Proposed conceptual payload: `{ before, amount, fillId, detachId }`, plus an empty-change representation.
The IDs reserve temporary storage locations using existing change-ID allocation and revision encoding.
They are not stable identities for the counter value or references applications can retain.
The counter's logical target is its owning node and field key, already represented by the modular changeset.

Within the agreed arithmetic scope:

- Authoring reads `before` and records `amount`; the output is `before + amount`.
- Compose consecutive edits by keeping the first input value and summing their amounts.
- Rebase an addition over a concurrent addition by updating its input value to the base edit's output while retaining its own amount.
- Invert by using the original output as the inverse input and negating the amount.
  Rebase this inverse normally when undo occurs after other additions.
- An empty or muted edit has no delta effect; cancellation can become empty when valid under the agreed arithmetic.
- Codec round trips preserve the input context and amount, not only a computed absolute assignment.

The required tests include sandwich rebases, composition versus sequential application, undo/redo after remote additions, and revision replacement.
Use the existing isolated-field rebaser helpers where appropriate, but do not inherit their identity `replaceRevisions` implementation for a payload containing IDs.
The handler must rewrite its temporary IDs and preserve allocation bounds.
Composed changes may discard temporary IDs for intermediate results, but must not introduce collisions between surviving fields.

This model does not support replacing the counter field through assignment, moving its numeric child between fields, or preserving that child's identity.
Those operations are not implied by the supplied API.
Parent node movement/removal/restoration remains the responsibility of the containing field kinds and must be tested with nested counter edits.
Do not expose counter children as ordinary replaceable required-field nodes in the editor.

### Replacement materialization and lifecycle

For an effective counter change, delta conversion should:

1. Build one numeric leaf with value `before + amount` at `fillId`.
2. Emit one replacement mark: `count: 1`, `attach: fillId`, `detach: detachId`.
3. Destroy the detached old leaf at `detachId` after attachment.

Both IDs are absent from the detached-field index when the delta completes.
An inverse rebuilds the required numeric result rather than restoring a historical leaf.
As a consequence, counter-specific numeric repair data need not accumulate, although normal commit history, revertibles, and removed parent subtrees can still consume memory.

Proposed shared-layer change: extend `FieldChangeDelta` with optional `build` and `destroy` members using the existing delta types.
Extend recursive modular delta aggregation to collect these alongside the outer modular builds/destructions, without overwriting either source.
Preserve existing constraint handling: field-generated work must not escape a conflicted/muted field change.
Document ownership of freshly created chunks and exercise both forest implementations.

For counter-generated leaves, the counter handler should not request external removed-root refreshers: its own delta builds supply the attached content.
The containing optional/sequence field must still request removed parent roots when needed.
Validate that this distinction remains correct during submission enrichment, resubmission, undo after history trimming, and summary/load.
Immediate destruction is safe only if no supported operation retains the old numeric child's identity; this remains an explicit integration-test obligation, especially with combined forest/anchor visitors.

Alternatives not recommended:

- Retaining ordinary required-field builds with different computed content under the same IDs.
  Rebase does not update those builds, and IDs may still identify retained repair data.
- Reading the live forest inside `intoDelta`.
  Delta conversion is intentionally independent of current forest state.
- A sequence of contributions.
  This would avoid the native extension question and introduce different storage/undo concerns.
- Extending delta with an arithmetic operation.
  The existing replacement mechanics already suffice for the tested storage operation.

### Transaction minimization and muting

Treat a counter addition as an atomic value edit at the change-model level, even though its delta is structural.
Do not route its two temporary storage IDs through filters that may independently keep the attach and detach.

Proposed minimal extension: a separate optional value-edit preservation flag in the field rebaser's filter options.
For example, `preserveValueChanges` could default to `preserveOtherEdits` for callers that do not specify it.
The exact name is provisional; its scope is field-value edits without independently movable children.

- Muting must drop value edits.
- Build squashing must include value edits to nodes created within the transaction.
- The residual change must retain value edits to pre-existing nodes that remain attached, while excluding edits already squashed into builds.
- Value edits in subtrees discarded by minimization must not leak back into the residual change.

Use the minimizer's existing built-node and output-attachment classification to make these decisions.
Do not simply turn `preserveOtherEdits` on: existing optional and sequence handlers use it for repair moves, renames, and other structural bookkeeping.
Keep those handlers' behavior unchanged.
Test counter edits alone, on newly inserted parents, on removed parents, and alongside ordinary field moves.
If the current classification is insufficient, return to consultation rather than disabling minimization for counters or silently losing their edits.

### API representation and concrete sharing

Recommended counter API policy, pending approval:

- Numeric constructor/default input.
- A readonly object property returning a counter accessor.
- Readonly accessor `.value` and `.add(amount): number`; no assignment/reset operation.
- Stable accessor identity on repeated reads and across hydration.
- Reading/removal/disposal and editing eligibility follow the owning node's existing lifecycle rules.

Implement the accessor in Simple-tree, cached by owning node and stored key.
Each operation obtains the current inner node through the [node kernel](../src/simple-tree/core/treeNodeKernel.ts), then resolves its field.
This avoids retaining a stale unhydrated field after hydration.
Use one property-read helper for both proxy `get` and `getOwnPropertyDescriptor`.
Do not make the low-level content-unboxing helper return application accessors everywhere: root-field and cloning APIs have different contracts.

Add counter-specific hydrated and unhydrated field editors.
The hydrated editor should use the existing `getFieldPathForEditing` eligibility check and submit additive changes with contextual input.
The unhydrated editor should use existing field-edit/event machinery to replace the single number directly.
Extend the mapped/default editor interfaces as necessary, without routing additions through the ordinary required-field `set` editor.

Concrete shared work:

- A small Simple-tree fixed-leaf policy mapping for identifier/string and counter/number, reused by schema creation, validation, and schema reconstruction.
  Keep public schema objects out of lower-level modular field-kind policy to preserve layering.
- Shared validation of the normalized allowed-type set, including reconstructed schemas, while retaining the explicit numeric schema argument in the example.
- Existing default-provider machinery and separate input/output type mappings.
  Do not infer an automatic default merely from being a fixed-leaf kind.
- A shared object-property read path, with per-kind presentation.
  Keep recursive/unsafe type counterparts synchronized.
- Readonly key handling for the new counter kind, without changing the existing identifier property's type contract in this experiment.

Identifier-only behavior must remain separate:

- Identifier default generation.
- Identifier-field discovery and indexing.
- Identifier-specific compressed encoding.

Two existing inconsistencies should be recorded rather than silently fixed:

- [ObjectFromSchemaRecord](../src/simple-tree/node-kinds/object/objectNode.ts) removes readonly from every field, including identifiers, while [setField](../src/simple-tree/node-kinds/object/objectNode.ts) only supports required and optional setters.
  Tightening identifier assignment types would be an existing API change, not necessary counter work.
- [schema reconstruction](../src/simple-tree/api/schemaFromSimple.ts) computes allowed types but the identifier case then constructs the canonical identifier schema without checking that set.
  Shared validation must distinguish valid-input preservation from a possible change in malformed-input handling.
  No malformed-input reproduction has been run yet.

Additional surfaces to wire or explicitly reject:

- Stored/view schema conversion and compatibility checks.
- Root configurations: reject a counter root explicitly in this object-field-first experiment rather than allowing a root accessor accidentally.
- Cloning/export of the owning object, schema export/reconstruction, JSON schema, defaults, and object unions.
  [Ambiguity detection](../src/simple-tree/api/configuration.ts) currently checks specifically for `FieldKind.Required`; adding counters requires a deliberate rule rather than an unreviewed switch to multiplicity.
- Generic APIs such as [cloneTree](../src/simple-tree/api/cloneTree.ts) currently treat non-node values as already-cloned primitives.
  Their widened field-value types must not accidentally accept a live counter accessor and return it unchanged.

### Format and compatibility proposal

Introduce a new experimental stored kind identifier and field codec version 1.
Do not permit schema upgrades to or from ordinary required/identifier fields merely because their forest shapes match.
Leave existing kind identities, existing version-specific field-kind tables, and existing parent-format dependency mappings unchanged.

The [SharedTree change codec dependencies](../src/shared-tree/sharedTreeChangeCodecs.ts) explicitly cannot be changed once used in production.
Therefore an experimental modular format needs a corresponding new parent format selection for the message and persisted-history paths, not just an entry added to a legacy field-kind table.
Reuse existing envelope encoders where possible; the payload shape does not itself require a new envelope.

Use existing explicit [codec write-version overrides](../src/codec/codec.ts), following the experimental configuration pattern in [treeFactory](../src/treeFactory.ts), instead of introducing a new general plugin or configuration framework.
The example can supply a configured tree through the existing `registry` and `key` options of [defineTreeDataStore](../src/treeDataStore.ts).
This is a proposed addition to its container setup, requiring approval; its counter field syntax remains unchanged.
The exact experimental version constants and parent dependency entries remain implementation details to verify before coding that path.

Default non-counter documents must retain their existing write-format selection.
Selecting an old format for a counter document should fail explicitly before persisting unsupported data, not silently down-convert or wait for a generic codec assertion.
The schema/initialization gate must cover initial summaries as well as later counter operations.
Old clients are not expected to collaborate on experimental counter documents; test explicit incompatibility instead.
The existing override option acknowledges potential incompatibility and must be documented as experimental, not described as a production compatibility guarantee.

### Adding the next kind: extension checklist

1. Define allowed content, multiplicity, initialization, read API, edit API, and semantic identity separately.
2. Register stored identity, upgrade policy, codec configuration, and explicit format availability.
3. Implement changeset algebra, revision handling, child/cross-field behavior, filtering, delta conversion, and removed-root requirements.
4. Supply hydrated/unhydrated editors and update typed/default/mapped editor paths.
5. Wire factory statics, normalized validation, input/output/readonly types, and recursive/unsafe counterparts.
6. Wire object property reads/descriptors and editing restrictions; decide other schema positions explicitly.
7. Check schema reconstruction, inspection, export, cloning, defaults, ambiguity, and identifier-only services.
8. Test algebra, lifecycle, events, minimization, compatibility, both forests, persistence, and state growth.

This remains a finite set of typed extension points rather than a promise of a single registration call.
An immutable field should reuse defaulting/content validation without acquiring a counter accessor.
A location-related kind may reuse fixed-leaf validation and field-bound accessors, but its rebasing, cross-field dependencies, and identity requirements remain separate.
A semantic successor may reuse helpers while retaining a distinct stored identifier and format/upgrade policy.

### Consultation gate

Recommended next authorization is a staged native implementation with:

1. Field-generated builds/destructions and the bounded replacement-lifecycle contract.
2. Value-edit-aware minimization, without changing structural repair filtering.
3. Fixed-leaf sharing and stable counter accessors, preserving existing identifier API behavior.
4. Explicit experimental format setup in the example.

Start by implementing and testing the first two items at the modular layer, then connect the API and persistence path.
Stop again if numeric-child identity must be retained, the minimizer needs a broader redesign, or format selection cannot be isolated without changing existing writes.
No code implementation or additional commit was made during this investigation.

## Preparation, technical debt, and shortcuts

For each finding, record: ID, affected layer, evidence, consequence, workaround, production remedy, and whether it blocks this experiment or only release.
Distinguish confirmed prerequisites from optional cleanup.

The retained implementation is a staged prerequisite, not an end-to-end counter.
It is deliberately not registered in production kind or codec configuration tables.
No API checks were disabled, no existing consumer was rewritten to conceal the type regression, and no arithmetic precision project was introduced.

| ID | Classification | Finding and next action |
| --- | --- | --- |
| P1 | Counter prerequisite | Add field-generated build/destroy aggregation; verify nested fields, constraints, chunk ownership, and temporary IDs. |
| P2 | Counter prerequisite | Add atomic value-edit handling to transaction minimization and muting; do not bypass either feature. |
| P3 | Shared preparation | Share fixed-leaf validation and object read dispatch using identifier/counter callers, with existing identifier regressions. |
| P4 | Compatibility prerequisite | Isolate experimental format selection and reject unsupported counter schemas before persistence. |
| P5 | Existing API debt | Identifier readonly typing and setter support disagree. Preserve current identifier behavior here; propose any tightening separately. |
| P6 | Investigation lead | Reconstructed fixed-leaf schemas need consistent allowed-type validation. Malformed identifier reconstruction is not yet reproduced. |
| P7 | Existing extension limitation | Generic APIs assume readable field content is a node, primitive, or undefined. Audit counter accessor acceptance rather than widening these types indiscriminately. |
| P8 | Confirmed implementation gate | Counter-only readonly key partitioning breaks existing generic subclassing. An original-key projection fixes subclassing but breaks generic noncounter assignments. Resolve both before reconnecting the public API. See the implementation gate below. |

## Compatibility and behavior changes

For each intentional change, record old behavior, experimental behavior, affected callers/documents, gating, test coverage, and the production migration or compatibility requirement.
Record accidental regressions separately and fix them.

The retained changes extend internal field delta aggregation and minimization filtering.
Existing handlers do not set the new build/destroy outputs or consume the new value-edit flag.
The experimental handler is used only through a test-local kind registry.
No default write selection, existing format table, supported API, identifier behavior, or example setup has changed.
No changeset was added because no user-facing capability is enabled by this paused stage.

## Existing issues and new defects

For each issue, record a minimal reproduction, expected and actual results, whether it predates this work, and disposition.
Clearly mark hypotheses and unverified observations.

Initial investigation leads are listed under Initial observations.
P5 is supported by source inspection; P6 remains an untested malformed-input hypothesis.
The [minimization post-processor documentation](../src/shared-tree/transactionMinimize.ts) still describes the API as an unimplemented no-op, although it invokes the minimizer and its existing tests pass.
Record that documentation discrepancy; do not use it to justify ignoring minimization.
The attempted public output-type implementation produced a confirmed compatibility regression (P8).
That implementation was removed.
Initial new test failures also exposed harness errors, described in the validation record below; they were corrected rather than weakening assertions.

## Implementation gate: readonly output types

### Evidence

The approved API presentation requires an object property whose constructor input is numeric and whose read result is a stable accessor.
The approved design also calls for counter-only readonly keys while preserving the existing identifier and ordinary-field type contracts.

The first implementation added a counter enum member, an accessor output mapping, and split `ObjectFromSchemaRecord<T>` into:

```ts
{
    -readonly [P in keyof T as T[P] extends FieldSchema<FieldKind.Counter> ? never : P]:
        P extends string ? TreeFieldFromImplicitField<T[P]> : unknown;
} & {
    readonly [P in keyof T as T[P] extends FieldSchema<FieldKind.Counter> ? P : never]:
        P extends string ? TreeFieldFromImplicitField<T[P]> : unknown;
}
```

`pnpm --dir packages/dds/tree run build:esm` then failed.
In addition to ordinary incomplete-wiring diagnostics, this produced six diagnostics in unchanged `src/tableSchema.ts`.
The decisive errors are TS2509 at the existing generic `Column` and `RowSchema` base class expressions (lines 218 and 370):
“Base constructor return type ... is not an object type or intersection of object types with statically known members.”
Their `TPropsSchema extends ImplicitFieldSchema` is not concrete enough to resolve the conditional property keys.
The missing-member/assignability diagnostics at lines 217, 279, 369, and 432 are consequences.

A second attempt wrapped the split mapping in a homomorphic materialization helper:

```ts
type MaterializeObject<T> = { [K in keyof T]: T[K] };
```

`cd packages/dds/tree && pnpm exec tsc --project tsconfig.json --pretty false` still produced the same six table diagnostics.
This is not evidence that every possible compatible TypeScript formulation is impossible.
It is evidence that the two bounded approaches tried here do not preserve an existing API usage pattern.
Fixing only the repository's table declarations would conceal the equivalent breaking change for consumers.

The attempted accessor widening also produced two diagnostics in `text/textDomainFormatted.ts` (lines 377 and 413).
These confirm P7: generic clone results are currently expected to be tree content, not accessors.
Those sites need an explicit content/accessor contract, not an unchecked cast.
They are secondary to the readonly/subclassing gate.

### Stopping decision and options

The incompatible Simple-tree, default-editor, FlexTree, and registry edits were removed.
No counter root, accessor, assignment policy, or experimental format is exposed in the retained implementation.
The working example remains unchanged and still has its eight baseline diagnostics.

The next decision is one of:

1. Authorize a focused output-type design investigation that must preserve generic subclassing, including downstream patterns, before resuming integration.
   This is the recommended next step.
   A solution may exist, but none was demonstrated by the two attempts above.
2. Explicitly relax counter-property compile-time readonly enforcement while retaining runtime assignment rejection and readonly accessor `.value`.
   This preserves the old homomorphic property map, but deviates from the approved readonly-key design and must not be chosen silently.
3. Authorize a separate counter-aware object schema API/type surface.
   This may isolate the type change, but deviates from the supplied `sf.object(...)` example and needs its own compatibility design.

Making every object field readonly, making identifier fields readonly, casting away the table errors, accepting accessor assignment silently, or suppressing type diagnostics are not acceptable workarounds.

### Focused readonly-type follow-up, 2026-10-21

**Result: the compatibility gate remains closed.**
The follow-up tested several different representations with the repository's TypeScript 6.0.3 compiler.
It found a partial solution to the original TS2509 failure, then rejected that solution after checking downstream generic setters.
No Simple-tree source, schema, consumer, or compiler setting was changed on disk.
The existing modular counter implementation was left intact.

The strongest candidate projects the original schema keys from an intersection containing a complete readonly property map and a filtered mutable map:

```ts
type Output<T extends Record<string, Field>> = Pick<
    { readonly [K in keyof T]: Read<T[K]> } & {
        -readonly [K in keyof T as T[K] extends Counter ? never : K]: Read<T[K]>
    },
    keyof T
>;
```

The complete first map makes `keyof T` a valid `Pick` argument.
The explicit `keyof T` projection lets TypeScript see the known object member names even when a field schema is generic.
This is different from materializing the keys of two conditional partitions.
For a concrete schema, the mutable map overrides readonly on ordinary and identifier properties, while the counter property remains readonly.

The reduced compiler tests established all of the following for this candidate:

- Concrete counter input is numeric, while output has `readonly value: number` and `add(delta: number): number`.
- Counter assignment and `.value` assignment produce TS2540.
  Supplying an accessor as numeric constructor input produces TS2322.
- Generic subclasses compile, both with and without an additional concrete counter property.
  A counter-constrained generic property's self-assignment also produces TS2540.
- Ordinary and identifier properties in concrete schemas remain writable.
- Exact type comparisons preserve the expected concrete member modifiers, empty objects, optional schema-record members, and symbol members in the reduced model.

However, this existing noncounter pattern becomes invalid:

```ts
function genericAllowed<S extends ImplicitAllowedTypes>(props: S) {
    class Column extends sf.object("Column", { props, id: sf.identifier }) {}
    function check(out: Column, value: TreeFieldFromImplicitField<S>) {
        const read: TreeFieldFromImplicitField<S> = out.props;
        out.props = value;
        out.id = "new-id";
    }
    return Column;
}
```

With the current implementation, this compiles.
With the projected candidate, `out.props = value` produces TS2540.
The `S extends ImplicitAllowedTypes` constraint is important: this regression does not depend on allowing a counter field in the generic parameter.
Reading the field, assigning the identifier, and declaring the subclass still compile.
The same setter regression occurs with `SchemaFactoryAlpha.object`.
Therefore passing the existing `tableSchema.ts` subclass declarations alone is insufficient evidence of compatibility.

#### Other representations tested

The reduced matrix used unsuppressed negative assignments and checked diagnostic codes and locations.
An unrelated error on a negative-test line was not counted as successful readonly enforcement.
It used no `any`, unchecked casts, or error-suppression directives.

| Representation | Result |
| --- | --- |
| Existing homomorphic mutable output map | Generic setters compile, but counter assignment is not readonly. This is the control, not a solution. |
| Conditional mutable/readonly partitions | Reproduces TS2509 on generic subclasses. |
| Complete readonly map intersected with a filtered mutable map, without projection | Still produces TS2509. |
| Original-key projection of the two filtered partitions | Avoids TS2509, but the type alias itself produces TS2344: TypeScript cannot prove that `keyof T` belongs to the partitions. Intersecting the key argument with their computed keys restores the TS2509 failure. |
| Complete readonly map, mutable overlay, and original-key projection | Solves subclass declarations and concrete readonly enforcement, but breaks the generic noncounter setter above. |
| Conditional fast path for schemas without counters | Deferred conditional output still produces TS2509. An intersection-based disjointness check does not resolve this. |
| Folding a union of per-property readonly/mutable records into an intersection | Concrete fields work, but the deferred intersection produces TS2509 for generic subclasses. |
| Preserving schema-record modifiers instead of removing readonly | Generic subclasses compile, but factory `const` inference also makes ordinary and identifier properties readonly. |
| Normalizing schema-record modifiers before mapping field values | Does not preserve generic setter typing; generic identifier assignment also produces TS2322. |
| Discriminant tests, inverse tests, boolean policy tables, direct key tables, disjoint intersections, and complement-key selection in the projected candidate | None preserves the generic noncounter setter. Some also change optional-property typing or make the generic object's identifier readonly. |

These results are not a proof that every TypeScript representation is impossible.
They rule out the tested formulations under the complete contract, rather than only the original subclassing check.

#### Commands and validation evidence

Commands ran from the repository root unless otherwise stated.
The two `.cjs` files below were disposable local compiler harnesses; they were removed after recording the results.
They used the installed TypeScript compiler API with in-memory source files.
No dependency was installed.
After removing both harnesses, `git diff --check` passed and `git status --short` showed only the pre-existing implementation paths and this report.

```sh
pnpm --dir packages/dds/tree exec tsc --version
pnpm --dir packages/dds/tree run build:esm
```

Passed: TypeScript 6.0.3 and the unchanged source build, respectively.

```sh
node .counter-readonly-investigation.cjs --summary
```

Failed the compatibility matrix, exit 1: none of the 18 formulations passed all checks.
The original-key projection with the complete readonly map had exactly one unexpected diagnostic, TS2540 on the generic noncounter setter, and zero missed expected negative diagnostics.
The diagnostic summary distinguished expected failures from regressions; counter assignment errors were required, not treated as a passing build by omission.
The earlier per-formulation commands used the same filename followed by the representation name, including:

```sh
node .counter-readonly-investigation.cjs pickReadonlyBackbone
node .counter-readonly-investigation.cjs conditionalFastPath
node .counter-readonly-investigation.cjs unionToIntersection
node .counter-readonly-investigation.cjs preserveInputModifiers
node .counter-readonly-investigation.cjs disjointIntersectionKeys
```

Their compatibility outcomes are recorded in the table above.
The final summary reran every formulation after correcting the harness.

```sh
node .counter-readonly-repository.cjs baseline
node .counter-readonly-repository.cjs candidate
```

The baseline passed with zero diagnostics.
The candidate failed with exactly four TS2540 diagnostics: one expected readonly assignment to the probe counter, and three unexpected generic setters.
The setters covered `SchemaFactory.object` with `ImplicitAllowedTypes` and `ImplicitFieldSchema` constraints, and `SchemaFactoryAlpha.object` with an `ImplicitAllowedTypes` constraint.
There were no diagnostics elsewhere in the full source program, including the unchanged `Column` and `RowSchema` declarations.

The real-source harness preserved the existing broad-schema special case and field-value mapping.
It selected the hypothetical counter using a test-only `FieldSchema<FieldKind.Required, typeof sf.number>` intersection with a readonly marker property.
This avoided adding a production enum member or reconnecting runtime integration merely to test property modifiers.
It is evidence about the type representation, not evidence of a functioning counter API.
Numeric-input/accessor-output behavior was tested separately in the reduced model.

Initial harness failures were corrected before these final runs:

- The first reduced file shadowed TypeScript's global `Required` utility; making the file a module removed that test-fixture error.
- Exporting a generic factory function with an inferred local subclass return type crashed declaration diagnostic generation with `Cannot read properties of undefined (reading 'flags')`, on both baseline and candidate.
  The probes were kept module-local so this unrelated declaration-generation issue did not obscure the property-assignment comparison.
  Existing source declaration checking remained enabled.
- Incomplete compiler-configuration loading produced TS6379 and then TS5074 concerning incremental/composite options.
  Passing the real configuration filename to `parseJsonConfigFileContent` fixed the harness without disabling those options.

#### Decision and actionable alternatives

Do not resume counter API integration on the strength of the projected type alone.
Any next candidate must compile the generic noncounter setter above, as well as the original table subclass declarations, and must reject direct counter assignment.
It must also preserve ordinary and identifier properties inferred from `const` schema records.
Once those checks pass, verify recursive/unsafe counterparts, declaration emit, broad schemas, defaults, and generic clone/content behavior before integrating accessors.

The previously listed contract alternatives remain available only with explicit approval:
retain the homomorphic mutable property map with runtime counter-assignment rejection, or isolate counters in a separate object-schema API/type surface.
The latter must avoid silently routing existing `sf.object` generic consumers through the readonly transformation.
Accepting the projected candidate's generic-setter regression would be another explicit compatibility relaxation, not a successful implementation of the current contract.

### Retained implementation

- A native, internal counter changeset and codec with `before`, `amount`, `fillId`, and `detachId`.
- Composition, contextual rebasing, inversion with separately allocated temporary IDs, revision replacement, empty changes, and atomic edit filtering.
- Numeric replacement materialization with temporary build/detach/destroy storage.
- Recursive field-generated build/destroy aggregation, without changing outer build/destruction semantics or constraint handling.
- Separate value-edit selection in the minimizer's build and residual partitions.
- Focused field-pipeline tests on both forests with combined forest/anchor visitors.

This does not demonstrate container collaboration, public undo/redo, stable accessors, hydration, fixed-leaf sharing, application events, parent moves, or summary/reload.
The counter is not production-ready and should not be registered in an existing format to make it reachable.

## Validation evidence

Record exact commands, outcomes, test counts or discovery evidence, and remaining gaps.
Separate baseline failures, counter failures, and unrelated environmental failures.
Measure retained counter state after repeated additions; do not infer bounded storage from a small operation payload.

### Baseline and existing tests, 2026-10-21

- `pnpm --dir packages/dds/tree run build:esm`: passed.
- `pnpm --dir packages/dds/tree run build:test:esm`: failed with eight TypeScript diagnostics, all in the deliberately noncompiling counter example.
  These include the missing `SchemaFactoryAlpha.counter` member and consequential input/output type errors.
  The two commands were executed in sequence with `&&`.
- VS Code `runTests`, selecting `src/test/core/tree/visitDelta.spec.ts`, `src/test/feature-libraries/default-field-kinds/defaultFieldKinds.spec.ts`, and `src/test/simple-tree/fieldSchema.spec.ts`: 79 passed, 0 failed; all three files discovered.
- VS Code `runTests`, selecting `src/test/simple-tree/identifierIndex.spec.ts` and `src/test/shared-tree/transactionMinimize.spec.ts`: 352 passed, 0 failed; both files discovered.

These are baseline regressions, not tests of a new counter.
No dependency installation was needed.
Use the package's existing [scripts](../package.json) and [test conventions](../src/test/README.md) during implementation.

### Existing-forest replacement probe

The following command passed on both reference and optimized forests, with 1,005 delta applications per forest.
Each application checked the output value, exactly one numeric child, and zero detached-field index entries.
The probe deliberately reused the same temporary IDs on successive applications.
It used anonymous deltas and generic numeric leaf content; it did not exercise counter schema validation, revision encoding, composed changesets, anchor events, actual undo, or collaboration.
It is not a performance benchmark or a measurement of retained commit history.

Two earlier probe attempts failed because the scratch harness first imported a conditional test-only package export without its Node condition, then tried to free a synchronous cursor which has no `free` method.
Neither failure was a forest replacement failure; the corrected probe uses production exports and the appropriate cursor API.

```sh
cd packages/dds/tree && node --input-type=module <<'NODE'
import { strict as assert } from 'node:assert';
import { makeDetachedFieldIndex, visitDelta, rootFieldKey, TreeStoredSchemaRepository } from './lib/core/index.js';
import { buildForest, buildChunkedForest, makeTreeChunker, defaultSchemaPolicy, defaultIncrementalEncodingPolicy, chunkFieldSingle, cursorForJsonableTreeField, defaultChunkPolicy } from './lib/feature-libraries/index.js';
import { Breakable } from './lib/util/index.js';
for (const [name, makeForest] of [
  ['reference', () => buildForest(new Breakable('counter design probe'))],
  ['optimized', () => buildChunkedForest(makeTreeChunker(new TreeStoredSchemaRepository(), defaultSchemaPolicy, defaultIncrementalEncodingPolicy))],
]) {
  const forest = makeForest();
  const index = makeDetachedFieldIndex('counter-design');
  const fill = { minor: 0 };
  const detach = { minor: 1 };
  let initialized = false;
  let applications = 0;
  for (const value of [200, 203, 208, 203, 200, ...Array.from({length: 1000}, (_, i) => i + 201)]) {
    const source = cursorForJsonableTreeField([{type: 'number', value}]);
    const chunk = chunkFieldSingle(source, {policy: defaultChunkPolicy, idCompressor: undefined});
    const delta = {
      build: [{ id: fill, trees: chunk }],
      fields: new Map([[rootFieldKey, { marks: [{ count: 1, attach: fill, ...(initialized ? { detach } : {}) }] }]]),
      ...(initialized ? { destroy: [{ id: detach, count: 1 }] } : {}),
    };
    const visitor = forest.acquireVisitor();
    try { visitDelta(delta, visitor, index, undefined); }
    finally { visitor.free(); chunk.referenceRemoved(); }
    const cursor = forest.getCursorAboveDetachedFields();
    cursor.enterField(rootFieldKey);
    assert.equal(cursor.getFieldLength(), 1);
    cursor.enterNode(0);
    assert.equal(cursor.value, value);
    assert.equal([...index.entries()].length, 0);
    initialized = true;
    applications++;
  }
  console.log(`${name}: ${applications} delta applications passed; one numeric child; zero retained detached-root entries after each application; same temporary IDs reused`);
}
NODE
```

## Historical native-pipeline assessment before API approval

### Implementation-stage validation, 2026-10-21

Final source build:

```sh
pnpm --dir packages/dds/tree run build:esm
```

Passed.
The rejected Simple-tree integration is not part of this result.

Final test build:

```sh
pnpm --dir packages/dds/tree run build:test:esm
```

Failed with exactly the eight original diagnostics in `src/test/counter.integration.ts`.
There are no diagnostics in the retained implementation or its tests.
The repository's TypeScript configuration still emits the test JavaScript on this baseline failure; no checking or emit setting was changed.

Focused runner:

```sh
set -o pipefail
cd packages/dds/tree && NODE_OPTIONS=--conditions=allow-ff-test-exports pnpm exec mocha --no-config \
  lib/test/feature-libraries/counterField.spec.js \
  lib/test/feature-libraries/modular-schema/modularChangeFamily.spec.js \
  lib/test/core/tree/visitDelta.spec.js \
  lib/test/feature-libraries/default-field-kinds/defaultFieldKinds.spec.js \
  lib/test/simple-tree/fieldSchema.spec.js \
  lib/test/simple-tree/identifierIndex.spec.js \
  lib/test/shared-tree/transactionMinimize.spec.js \
  --timeout 20000 --reporter dot --exit 2>&1 | tail -18
```

Passed: 524 tests (14 new and 510 existing), zero failures.
An earlier run before adding the final aggregation test passed 523 tests.
The existing tests intentionally log assertions `0x8cd` and `0x929`; these are not runner failures.
VS Code `runTests` did not discover the newly added test file, so the repository's Mocha runner was used instead.

Formatting and lint:

```sh
cd packages/dds/tree && pnpm exec biome check --write \
  src/feature-libraries/counter-field \
  src/feature-libraries/index.ts \
  src/feature-libraries/fieldKindIdentifiers.ts \
  src/feature-libraries/modular-schema/fieldChangeHandler.ts \
  src/feature-libraries/modular-schema/modularChangeFamily.ts \
  src/feature-libraries/modular-schema/minimizeModularChange.ts \
  src/test/feature-libraries/counterField.spec.ts

pnpm exec eslint --quiet \
  src/feature-libraries/counter-field \
  src/feature-libraries/index.ts \
  src/feature-libraries/fieldKindIdentifiers.ts \
  src/feature-libraries/modular-schema/fieldChangeHandler.ts \
  src/feature-libraries/modular-schema/modularChangeFamily.ts \
  src/feature-libraries/modular-schema/minimizeModularChange.ts \
  src/test/feature-libraries/counterField.spec.ts
```

Passed.
Biome formatted the new files.
Initial ESLint failures required a tree-shakeable TypeBox namespace import and imports through the appropriate internal library entry points; these were corrected.
No new lint rule was disabled in production code.
`git diff --check` passed.
No dependencies were installed.

Earlier implementation-stage failures:

- `pnpm --dir packages/dds/tree run build:esm`: initially failed on incomplete editor wiring, the readonly mapping regression, and generic clone/content incompatibilities.
  A temporary misplaced class declaration was also corrected during that iteration.
  Removing the incompatible API integration restored the source build.
- `pnpm --dir packages/dds/tree run build:test:esm`: initially reported additional test-harness diagnostics (incorrect import, missing brands/metadata, and treating the codec returned by `resolve` as if it had a `.json` property).
  These were corrected; only the eight baseline example errors remain.
- `cd packages/dds/tree && pnpm exec mocha --no-config lib/test/feature-libraries/counterField.spec.js --timeout 20000`: failed because the test-only dependency exports require `--conditions=allow-ff-test-exports`.
  The condition was added to the subsequent runner commands.
- `cd packages/dds/tree && NODE_OPTIONS=--conditions=allow-ff-test-exports pnpm exec mocha --no-config lib/test/feature-libraries/counterField.spec.js --timeout 20000`: initially passed three and failed five tests.
  The optimized-forest fixture lacked stored schema (`0xaf9`).
  The newly built-parent fixture incorrectly described a child edit before insertion instead of composing insertion followed by editing (`0x7d0`).
  Both fixtures were corrected.
  A later codec test failed on the incorrect `.json` access above; correcting the harness restored it.

### Results and remaining work

The retained tests exercise concurrent additions in both orders, selective undo and redo at the change-family level, composition, rollback, revision replacement, codec JSON round trips, atomic filtering, and conflicted changes.
They cover minimization on existing, newly built, and removed parents.
They also cover aggregation of nested field-generated work alongside outer build/destruction outputs.
Both reference and optimized forests apply the nested counter deltas successfully.

For each forest, the repeated-edit test applies 1,000 additions and checks one numeric child and zero detached-index entries after every addition.
This measures temporary numeric storage, not retained commit history, summary size, or public-node memory.
No performance benchmark or unconditional floating-point convergence claim is made.

Native modular extensibility is feasible for this tested subset with the approved bounded shared changes.
At this historical checkpoint, public API feasibility under the original readonly-property constraint remained unresolved.
The subsequent approval explicitly removed that constraint and authorized integration without readonly key partitioning.
The integration and final assessment below supersede this checkpoint's remaining-work list.
No evidence here establishes feasibility for location-related identity tracking.
No commit was made.

## Integrated end-to-end assessment, 2026-10-21

The approved object-field-first contract is implemented.
The original homomorphic mutable property mapping remains intact.
No readonly-key partitioning, broad minimizer redesign, identifier-service change, or persisted accessor representation is retained.

### Acceptance results

| Contract | Verified result |
| --- | --- |
| Factory and initialization | Static/instance `SchemaFactoryAlpha.counter`, numeric initialization, explicit missing-initializer type error, `withDefault`, and stored keys work. |
| Accessors | `.value` is readonly; `.add` returns the immediate local result; accessor identity survives hydration and parent movement. |
| Assignment restrictions | Numeric assignment type-errors; numeric/accessor assignment, deletion, and property redefinition throw at runtime. Accessor-to-accessor assignment intentionally remains type-correct. |
| Collaboration | The container example actually runs and converges to 210; independent concurrent additions converge in acceptance tests. |
| History | Undo/redo after remote additions preserves the remote contribution, including a minimized transaction with structural content edits. |
| Transactions | Rollback, minimized existing-node edits, insertion followed by edits, and insertion/edit/removal pass. |
| Events and lifetime | Unhydrated/hydrated change events, stored-to-property key mapping, parent movement, removal, restoration, and disposed-owner rejection pass. |
| Persistence | Real on-demand summary/reload followed by new concurrent edits passes. Old-format initialization and load are explicitly rejected. |
| Content APIs | Clone isolation, runtime accessor-clone rejection, concise/verbose/compressed round trips, raw child enumeration, and view/stored schema reconstruction pass. |
| Compatibility | Existing identifier, table, generic object subclass/setter, recursive schema, formatted-text, checkout, independent-view, codec, and object suites pass. |
| Discovery and typing | Both counter test files run through the repository's default test discovery. Source and all test declarations compile, including negative type assertions. |

Compressed content import internally initializes an independent checkout.
Accordingly its experimental counter test supplies the same explicit message/history override options, in addition to its JSON validator.
Without those options, initialization correctly rejects the counter schema.
The content itself remains ordinary numeric leaves; no accessor is encoded by any content format.
The first compressed-import test omitted these overrides and failed at the explicit schema gate; adding the opt-in options made all three format round trips pass.

### Final validation

The following repository commands passed:

```sh
pnpm --dir packages/dds/tree run generate:entrypoint-sources
pnpm --dir packages/dds/tree run build:esm
pnpm --dir packages/dds/tree run build:test:esm
pnpm --dir packages/dds/tree run build:cjs
pnpm --dir packages/dds/tree run build:api-reports
pnpm --dir packages/dds/tree run ci:build:api-reports
```

API export validation passed for all four ESM tiers and all four CommonJS tiers:

```sh
cd packages/dds/tree
pnpm run check:exports:esm:alpha
pnpm run check:exports:esm:beta
pnpm run check:exports:esm:legacy
pnpm run check:exports:esm:public
pnpm run check:exports:cjs:alpha
pnpm run check:exports:cjs:beta
pnpm run check:exports:cjs:legacy
pnpm run check:exports:cjs:public
pnpm run check:exports:bundle-release-tags
```

API Extractor reports its existing `skipLibCheck` and TypeScript 6.0.3 versus bundled 5.9.3 warnings; extraction and export checks succeed.
The initial clone-overload documentation reference was ambiguous between the interface and value.
Using the explicit interface selector resolved it.
Generated API reports were not hand-edited.
The entrypoint generator adds trailing spaces, including to previously normalized lines.
Only newly introduced whitespace was normalized afterward; unrelated exports were not added or removed.

The final combined regression selection passed **2,523 tests**, with **seven pending** and no failures:

```sh
cd packages/dds/tree
NODE_OPTIONS=--conditions=allow-ff-test-exports pnpm exec mocha \
  --no-config \
  --require @fluid-internal/mocha-test-setup \
  --require source-map-support/register \
  lib/test/mochaHooks.js \
  lib/test/simple-tree/counter.spec.js \
  lib/test/counter.integration.js \
  lib/test/feature-libraries/counterField.spec.js \
  lib/test/feature-libraries/modular-schema/modularChangeFamily.spec.js \
  lib/test/core/tree/visitDelta.spec.js \
  lib/test/feature-libraries/default-field-kinds/defaultFieldKinds.spec.js \
  lib/test/simple-tree/fieldSchema.spec.js \
  lib/test/simple-tree/identifierIndex.spec.js \
  lib/test/shared-tree/transactionMinimize.spec.js \
  lib/test/shared-tree-core/messageCodec.spec.js \
  lib/test/shared-tree-core/edit-manager/editManager.spec.js \
  lib/test/shared-tree-core/editManagerSummarizer.spec.js \
  lib/test/shared-tree/sharedTreeChangeCodec.spec.js \
  lib/test/simple-tree/api/schemaFactory.spec.js \
  lib/test/simple-tree/api/schemaFactoryRecursive.spec.js \
  lib/test/simple-tree/api/schemaFromSimple.spec.js \
  lib/test/simple-tree/node-kinds/object/objectNode.spec.js \
  lib/test/simple-tree/node-kinds/object/objectNodeTypes.spec.js \
  lib/test/tableSchema.spec.js \
  lib/test/simple-tree/api/treeNodeApi.spec.js \
  lib/test/text/textDomainFormatted.spec.js \
  lib/test/shared-tree/tree.spec.js \
  lib/test/shared-tree/treeCheckout.spec.js \
  lib/test/shared-tree/independentView.spec.js \
  --timeout 30000 --exit
```

Default repository discovery was separately verified, not merely inferred from an explicit file list:

```sh
cd packages/dds/tree
NODE_OPTIONS=--conditions=allow-ff-test-exports pnpm run test:mocha:esm \
  -- --grep '^(native counter integration|counter example)'
```

Result: **16 passing**, including both examples and the new acceptance suite.
The repository configuration recursively discovers JavaScript under `lib/test`.

Changed-source formatting and lint passed:

```sh
cd packages/dds/tree
pnpm exec eslint --quiet --fix \
  $(git diff --name-only --relative -- '*.ts' | grep -v '^src/entrypoints/') \
  src/feature-libraries/counter-field/counterField.ts \
  src/test/simple-tree/counter.spec.ts \
  src/test/feature-libraries/counterField.spec.ts
pnpm exec biome check --write \
  $(git diff --name-only --relative -- '*.ts' | grep -v '^src/entrypoints/') \
  src/feature-libraries/counter-field \
  src/test/simple-tree/counter.spec.ts \
  src/test/feature-libraries/counterField.spec.ts
```

The full repository suite, production-emulation suite, cross-version interoperability suite, performance benchmarks, and release type tests were not run.
`git diff --check` passed, and the only snapshot change is the new experimental codec entry.
No dependencies were installed and no commit was created.

Downstream aggregator validation was attempted:

```sh
pnpm --dir packages/framework/fluid-framework run build:esm
```

It failed with six diagnostics: missing `@fluidframework/fluid-static` and `@fluidframework/sequence` declarations, plus incompatible `IFluidLoadable` symbol identities resolved from two different worktrees.
The aggregator's dependency graph is therefore not a valid independent build environment for this check.
Its chained `build:api-reports` command was not run after the failed build, so downstream reports remain unverified.
Shared dependency links were not rewritten and unrelated packages were not cleaned.
This does not affect the successful tree package source/test/CommonJS builds, generated API reports, export checks, or runtime tests.

### API and release review

The resolved comparison base is `a8838c30ce335519fdb5409d9d507c16239253b8` on canonical `main`.
The worktree also contains the retained implementation from before this integration.
Five generated tree API reports and the generated tiered entrypoint sources reflect the integrated API.

| Surface | Release classification and review |
| --- | --- |
| `SchemaFactoryAlpha.counter`, `FieldKind.Counter`, `TreeCounter` | Alpha experimental additions; area-owner review required before merge. |
| `TreeRootFromImplicitField` and existing field/root type mappings | Public/system additive helper and signature refinements; ordinary existing schema outputs remain unchanged, but generic compatibility requires API review. |
| Create/import/clone signatures and alpha readable-root alias | Raw-content constraints exclude accessors; existing package consumers and generic regression examples compile. |
| Existing stable identifiers | No identifier factory, defaulting, tracking, or compression API change. |

Because the work changes public/system and beta signatures as well as alpha additions, [API Council review](https://eng.ms/docs/experiences-devices/opg/office-shared/fluid-framework/fluid-framework-internal/fluid-framework/docs/dev/resources/api-council) is required in addition to area-owner review.
No such approval is claimed.
No existing member was removed or deprecated; successful package compilation does not prove compatibility for every external generic caller.
The experimental changeset covers `@fluidframework/tree` and its `fluid-framework` aggregator, and is excluded from release notes.
The user approved its wording; this does not constitute API Council approval or authorization to commit.
The aggregator API reports still need regeneration in a consistent dependency environment.
This validation is not an unconditional merge-readiness claim.

### Explicit limitations and remaining research

- The approved property-readonly limitation remains: assigning another accessor can type-check and then throws.
  `.value` itself is readonly both in types and at runtime.
- Root counters are explicitly rejected.
  Counter fields are supported on object nodes, including objects nested in arrays and recursive objects.
- The local API rejects non-finite additions/results.
  JavaScript floating-point arithmetic is retained; arbitrary fractional histories and concurrent overflow do not have an unconditional convergence guarantee.
- Accessors follow the owning node's lifetime.
  Removed retained nodes can be read, cannot be edited until restored, and disposed owners are unusable.
- Experimental message/history overrides are required together.
  Existing formats and default write selections remain unchanged; mixed-version compatibility is not promised.
- Standalone serialized-change transfer continues choosing the newest stable numeric format.
  It does not support counter changes in this experiment; container messages, history, and summary/reload do.
- Numeric temporary-storage bounds are covered by the retained 1,000-edit tests for both forests.
  No claim is made about bounded retained history, total memory, or throughput.
- These results establish the tested counter integration, not the planned index field's concurrent or undo semantics.
  Stable element identity is not a prerequisite established by the selected extrinsic-range direction; see the context update below.

### Documentation follow-up

The documentation pass covers both the application API and the internal extension contracts:

- The counter field editor documents its input context, caller-owned validation, and path lifetime.
- Changeset members, composition/rebasing intent, temporary-ID lifetime, chunk ownership, conflict handling, and atomic value filtering have implementation-facing documentation.
- Schema factories and accessors explain initialization versus reading, defaults, stable accessor identity, owner lifetime, runtime assignment restrictions, and numeric limitations.
- Hydrated and unhydrated editors, raw-content conversion and cloning, root restrictions, and experimental format selection describe their distinct responsibilities.
- A short unhydrated example illustrates construction, reading, and addition without container setup.

The documentation-model build found three existing links made ambiguous by the new clone overload and a static/instance counter link ambiguity.
These links now select the intended declarations.
This is why documentation-model validation is needed in addition to API-report generation.

Source and test compilation and `build:docs` passed after the link fixes.
API Extractor still reports the existing `skipLibCheck` and bundled-TypeScript-version warnings.
Focused formatting checks passed; ESLint completed with zero errors and 28 warnings, including existing documentation/directive warnings and implementation import/test warnings.
`git diff --check` passed, with Git's line-ending notices for the generated API reports.
The comment-free emitted JavaScript for the 57 originally changed TypeScript files matches the pre-documentation build.
The documentation pass does not change runtime behavior; the earlier runtime test results above remain the implementation validation.

### Permanent infrastructure-review regression tests

The review-time probes are now part of the counter integration suite:

- Generic readers compile when returning either field-read or raw-root types from a `TreeView`, including readers constrained to implicit allowed types.
- A minimized transaction edits an existing counter-owning node and moves it into a newly built parent.
- A minimized transaction edits a newly built counter-owning node, moves it into an existing parent, and removes its original parent.

Both move cases check the resulting structure and values on two synchronized clients, then check undo and redo on both clients.
The history stacks are asserted to contain the expected edit so missing undo/redo coverage cannot silently pass.
Formatting, ESLint, and `build:test:esm` passed.
The counter integration suite passed all 17 tests after these additions.

### Extrinsic-range context update

The follow-up investigation now incorporates [microsoft/FluidFramework#27621](https://github.com/microsoft/FluidFramework/pull/27621), inspected at commit `78c058d79fa8f60bff2ccb55a5abd5b2392b450b`.
Its [design README](https://github.com/microsoft/FluidFramework/blob/78c058d79fa8f60bff2ccb55a5abd5b2392b450b/packages/dds/tree/src/extrinsic-locations/README.md) supplies an existing plan rather than a new requirement to design native references.

The selected approach stores numeric endpoints elsewhere in the same tree and has content-editing APIs maintain them explicitly.
The current constrained MVP uses insertion points with after-insertion affinity, collapses endpoints on removal, and keeps ranges with their owning collection rather than following moved content.
The planned index field rebases operation coordinates and aims to reuse sequence change logic.
These facts resolve several questions initially left open in the follow-up note.

This context changes how to apply the counter results:

- Reuse numeric storage, accessor lifetime patterns, and appropriate modular extension points, but investigate sequence logic before generalizing counter arithmetic.
- Do not require stable element identity or support for external locations as prerequisites.
- Do not assume independent endpoint fields solve range-level merge behavior or concurrent changes to range membership.
  Narrower constraints and eventually bulk editing are separate parts of the existing plan.
- Keep schema migration, supported field-kind evolution, and rollout separate from proving the index algebra.
- Treat undo/redo, overlapping removals, moves, and endpoint crossing as remaining future-design work.
  The MVP's constraint-protected tests do not validate unconstrained merging.

The updated [array-location design note](./array-location-field-design.md) records the baseline rules, source links, unresolved questions, and revised sequence-reuse-first investigation.
This update changes the documented investigation plan only; no index field, sequence reuse, or bulk-editing implementation has been added or validated.

### Index investigation and independent preparation, 2026-10-22

The [focused index investigation](./array-location-field-design.md#focused-investigation-results-2026-10-22) now includes four passing executable tests and a cleanup-candidate inventory with prerequisites and validation requirements.
It uses existing sequence changesets and insertion anchors; no production index kind was added.

The tests establish a concrete limit on reuse: correctly rebased sequence edits can produce identical content but different scalar endpoint projections.
Removing a span and applying its inverse also loses endpoint offsets, while projecting their composed empty delta leaves the original offsets unchanged.
Thus the current shallow anchor arithmetic cannot simply become the index field's merge/undo implementation.
These are limitations of that proposed composition, not sequence convergence defects or regressions in the counter.

The conclusion for preparation PRs is selective:

- Documentation corrections and independently useful tests need not wait.
- Field-generated build/destroy support can be evaluated separately with a neutral test handler and ownership/cleanup coverage.
- Atomic-value filtering needs explicit treatment of semantic context before it is presented as sufficient for indexes.
- General terminal-field helpers and sequence adapters should wait for a viable endpoint representation.
- Public type refinements, experimental formats, and production field-kind rollout remain feature-coupled.

The complete candidate table and exact test commands are in the design note.
No standalone PRs were opened, and no existing code was refactored during this investigation.

### Positive contextual-arithmetic experiment

A [follow-up model](./array-location-field-design.md#contextual-arithmetic-follow-up-2026-10-22) demonstrates conditional arithmetic with convergent rebasing and selective undo/redo for edits sharing one original coordinate system.
It retains identified edits and revert dependencies, subtracts the union of active removal intervals before the original endpoint, and adds active insertions at or before it.
This fixes the earlier projection counterexamples within that domain without changing the forest.

Six focused tests pass, including exhaustive small same-context pairs, overlapping-removal undo, and a negative test showing why causally authored coordinates cannot be treated as original coordinates.
The experiment retains history; it is not a compact production rebaser, and does not establish causal coordinate translation, moves, explicit endpoint reassignment, or history compaction.
Formatting, lint, and test compilation pass; a broader discovery attempt was blocked by a missing `sha.js` dependency before tests ran.
The design note records the rules, limits, and exact successful test command.
After the dependency installation was repaired, both investigation suites passed together through default test discovery (10 tests), and test compilation and focused Biome/ESLint checks passed again.

### Downstream root-content compatibility

After dependency installation was repaired, compiling `@fluidframework/tree-agent` and `@fluidframework/react` exposed six errors caused by generic root-content APIs still using `TreeFieldFromImplicitField`.
That type now admits counter accessors, whereas roots and subtree replacement accept raw tree content.
This is a consumer migration cost of the proof of concept, not a dependency-resolution failure.

- Tree-agent's subtree setter and context root setter now use `ReadableField`, matching their getters and the existing context API.
  This also keeps record-child replacement free of accessor objects.
- React's `TreeViewProps`, root hook result, and root hook state now use `TreeRootFromImplicitField`.
  Initializer types and runtime rendering behavior are unchanged.
- No casts were added to hide accessor leakage.
  No new counter editing support in tree-agent or reactive counter-property observation in React is claimed.
- Regression coverage exercises generic optional-root replacement through tree-agent and numeric-root rendering/replacement in both React strict modes.

Validation passed:

- Both packages: `pnpm run build:esm`, `pnpm run build:test:esm`, `pnpm run build:entrypoints:esm`, `pnpm run build:api-reports`, and `pnpm run build:docs`.
- Tree-agent: `pnpm run build:cjs`, `pnpm run build:test:cjs`, and `pnpm run build:entrypoints:cjs`.
- Tree-agent: `pnpm run test:mocha:esm -- --grep '^(Context|createTreeAgent)'` (16 tests, using mock models rather than external AI services).
- React: `pnpm run test:mocha:esm -- --grep '^reactSharedTreeView'` (five tests).
- Focused Biome and ESLint checks on the five edited source/test files (no errors; existing lint warnings remain).

API report generation initially failed because the generated alpha entrypoints were missing; generating entrypoints resolved that prerequisite in both packages.
API Extractor still reports its existing TypeScript-version warning and React's `skipLibCheck` warning.
The regenerated React alpha report changes only the root prop type.
Tree-agent's exported API report is unchanged.
Existing aggregator report edits were preserved.

The React-only signature correction is alpha and needs no API Council approval on its own.
The full counter branch still changes public and beta tree APIs and aggregator re-exports, so Council review and a compatibility audit remain production prerequisites.
The raw-content migration must be checked against generic consumers before any claim of source compatibility or production readiness.
The experimental changeset now includes React's root-prop correction.

### Aggregator API report synchronization

The five pending `fluid-framework` API reports reflect the counter and raw-root types already exported by the tree package.
Rebuilding the aggregator, generating its ESM entrypoints, and regenerating current and legacy reports reproduced all five files byte-for-byte.
These are generated synchronization changes, not a second implementation or an independent API proposal.

The entrypoint generator exited successfully but printed an error-level diagnostic about the existing `InternalTypes` namespace lacking a recognized API-level tag.
The namespace's source is unchanged by this work; this diagnostic remains a follow-up rather than a reason to hand-edit generated reports.
API Extractor completed successfully with its TypeScript-version warning.
