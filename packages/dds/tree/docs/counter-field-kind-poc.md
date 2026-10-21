# Counter field kind proof of concept

## Status and purpose

Planning draft: implementation has not been authorized or started.
This document describes an experiment, not a supported feature or a release commitment.
Update it throughout the experiment, including failed approaches and decisions that change.

The experiment should answer:

- Can a native counter field kind provide the API in the [counter example](../src/test/counter.integration.ts)?
- What changes are needed across schema, editing, storage, collaboration, and the application-facing API?
- Which changes are specific to counters, and which prepare SharedTree for other field kinds?
- What does this reveal about a future field kind for extrinsic array locations, without implementing that feature?

## Proposed acceptance contract

The object-field-first, end-to-end scope and JavaScript-number arithmetic have been agreed.
The detailed contract below is the proposed implementation target; implementation still requires explicit approval.

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

## Preparation, technical debt, and shortcuts

For each finding, record: ID, affected layer, evidence, consequence, workaround, production remedy, and whether it blocks this experiment or only release.
Distinguish confirmed prerequisites from optional cleanup.

No implementation shortcuts have been taken yet.
Candidate investigations include field-kind assumptions in schema/type mappings, field-kind-generated replacement content, and format-version registration.
Do not classify these as confirmed defects before tracing and testing them.

## Compatibility and behavior changes

For each intentional change, record old behavior, experimental behavior, affected callers/documents, gating, test coverage, and the production migration or compatibility requirement.
Record accidental regressions separately and fix them.

No implementation changes have been made yet.

## Existing issues and new defects

For each issue, record a minimal reproduction, expected and actual results, whether it predates this work, and disposition.
Clearly mark hypotheses and unverified observations.

Initial investigation leads are listed under Initial observations.

## Validation evidence

Record exact commands, outcomes, test counts or discovery evidence, and remaining gaps.
Separate baseline failures, counter failures, and unrelated environmental failures.
Measure retained counter state after repeated additions; do not infer bounded storage from a small operation payload.

No build or tests have been run during this planning step.
Implementation should use the package's existing [scripts](../package.json) and [test conventions](../src/test/README.md).

## Final assessment

To be completed after implementation or an agreed stopping point:

- API feasibility and deviations from the example.
- Native field-kind integration cost, by layer.
- Correctness and compatibility guarantees demonstrated versus untested.
- State-growth and performance observations, with measurement conditions.
- Production prerequisites in recommended order.
- Implications and remaining unknowns for extrinsic locations and other future field kinds.
- Recommendation: continue, redesign, or defer, with evidence.
