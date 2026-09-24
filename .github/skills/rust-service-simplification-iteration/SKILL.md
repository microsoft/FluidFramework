---
name: rust-service-simplification-iteration
description: 'Design and run a patch-first Rust-service simplification iteration across documentation, tests, implementations, abstractions, code organization, and naming while preserving behavior and proportionate regression evidence. Use when configuring, executing, reviewing, or repeating simplification, consolidation, deduplication, code-size reduction, or broad cleanup across rust-service crates.'
argument-hint: 'configure or run a Rust-service simplification and consolidation pass'
---

# Rust Service Simplification Iteration

Use this workflow to reduce accidental complexity in Rust-service code, tests, and documentation without weakening essential behavior, diagnostics, performance, ownership boundaries, or supported platforms.
Read `rust-service/DEVELOPMENT.md` for the quality bar and validation requirements.

The default workflow is **patch first**:

1. assign a category and ownership scope;
2. edit the checkout, then assemble a reviewable checkpoint;
3. freeze and validate the patch;
4. independently review its complete fixed-base diff; and
5. correct or revert edits through the same bounded loop, then retain only the accepted patch.

The diff is the primary proposal and review artifact.
Do not require an English candidate description before making a cheap, reversible local edit.
Use proposal-first assessment only when implementation is expensive, crosses ownership, or could change a public, protocol, persistence, concurrency, platform, generated, or performance boundary.

Record the approved source commit for the run and the fixed base for each checkpoint.
Treat size and edit counts as descriptive evidence, not targets.

## Relationship to Quality Iterations

Prefer this order when both workflows are planned:

1. complete and integrate the contract and regression-test quality iteration;
2. use that accepted commit and quality inventory as simplification evidence; and
3. review changed and directly affected contracts and tests during diff review.

Do not run broad quality and simplification work concurrently against moving versions of the same code.
A prior quality inventory is useful but not mandatory.
When required behavior or ownership cannot be established from current contracts and tests, leave that edit out of the patch and route the gap to the quality workflow.

## Principles

- **The purpose of this workflow is to reduce accidental complexity while preserving essential complexity.**
  For every existing or added element in the selected surface, ask whether behavior, the intended audience, diagnostic value, ownership, supported variation, platform constraints, or performance makes it necessary.
  Remove, consolidate, relocate, or narrow elements whose complexity is not justified.
- Preserve required qualities, not their current representation.
  Existing prose, tests, names, files, states, branches, conversions, and abstractions are evidence to assess, not structures that must automatically survive.
- Additions are justified when they close a consequential gap, establish a clearer authoritative owner, or enable a larger reduction in accidental complexity.
  Material growth without a concrete audience, evidence, ownership, or mechanism benefit is not simplification.
- Review must challenge both loss of necessary value and retention, displacement, or introduction of accidental complexity.
- Improve the current source; do not infer a defect from historical growth or file size.
- Prefer a concrete reversible patch over a speculative prose inventory.
- Preserve required behavior, useful diagnostics, performance characteristics, and platform support.
- Prefer deletion and reuse over moving complexity or introducing a more general abstraction.
- Count consolidation only when one clear owner replaces competing implementations.
- Treat generated code, explicit error handling, platform-specific implementations, and distinct test layers as intentional until the diff and evidence show otherwise.
- Do not optimize line count at the cost of readability, type safety, failure isolation, or local diagnosis.
- Do not force edits merely to show activity.
- Preserve significant rejected transformations and blockers, but do not catalog every unchanged declaration or hypothetical cleanup.

## Category Strategies

A **checkpoint** is one reviewable patch with a fixed base, validation set, and acceptance decision.
A **wave** covers one category through one or more checkpoints.
Use one primary category per checkpoint; a broad wave does not require one all-crate diff.

| Category | Default strategy | Intended improvements | Required safeguards |
| --- | --- | --- | --- |
| Documentation | Patch first | Remove unnecessary detail, duplication, narration, and misplaced information; retain or add only what the intended audience needs. | Preserve required contracts, qualifications, useful local context, non-obvious reasoning, and discoverability. Account for inherited and authoritative documentation. |
| Tests | Patch first | Remove or consolidate redundant cases, assertions, fixtures, helpers, and layers while preserving consequential regression evidence. | Preserve distinct behavioral obligations, independent expectations, execution, isolation, and useful failure diagnosis rather than every current test artifact. Check for expectations derived from production code, hidden or unexecuted scenarios, and shared state introduced by consolidation. |
| Naming | Patch first for private/local names | Reduce misleading, redundant, inconsistent, or unnecessarily specific vocabulary. | Improve responsibility or call-site comprehension rather than substituting stylistic preference; check public, serialized, reflected, generated, diagnostic, and operational names. Check for mixed old and new terminology at affected call sites. |
| Code organization | Patch first for local mechanical cleanup | Reduce unnecessary files, modules, forwarding layers, visibility, imports, dependency edges, and navigation. | Move code only to a clearer owner or when the move enables deletion of a boundary; preserve necessary platform, lifecycle, and failure separation. Check for broader visibility, added forwarding, and lost comments, attributes, initialization, or build inclusion during moves. |
| Implementation | Patch first for local mechanics; proposal first for risky boundaries | Remove unnecessary mechanisms, states, branches, validation, conversions, allocations, clones, wrappers, synchronization, and lifecycle phases. | Preserve documented contracts and demonstrated consumer requirements, including evaluation order, errors, side effects, resource lifetimes, concurrency, and performance. |
| Abstractions | Patch first for private removal; proposal or prototype first for new or shared surfaces | Remove layers, traits, wrappers, adapters, genericity, configuration, and extension points that do not own meaningful variation, policy, substitution, invariants, or dependency direction. | Prefer direct code or small duplication over false sharing; do not collapse distinct platform, failure, persistence, or lifecycle guarantees. |

Suggested broad-wave order:

1. documentation;
2. tests;
3. naming;
4. local code organization;
5. local implementation;
6. abstractions and cross-crate consolidation.

Finish review and integration of one wave before a later wave obscures its diff.
Combine categories only when supporting edits are inseparable and the combined patch remains easy to review.

## Configure One Run

Resolve every configuration dimension below before editing.
Ask one question at a time and do not bundle decisions into one answer.
Never treat selection of scope or execution structure as approval of categories, profile, wave order, commit authority, isolation, validation scope, or change constraints.
Skip only a decision the user already supplied explicitly or that is inapplicable, such as wave order for one category.

### 1. Choose Review Basis and Scope

Offer:

- **Current-state pass:** review the selected scopes and categories regardless of change history.
- **Incremental pass:** revisit changed code or explicit triggers from an earlier run.

Then load and follow the [multiselect skill](../multiselect/SKILL.md) to select one or more current Cargo workspace members or responsibility areas.
Read the workspace manifest rather than copying a stale member list into this skill.
Offer `ALL`.
Cargo members are the default editable scopes for this Rust-focused workflow.
Treat the Rust-service TypeScript packages as validation consumers unless the user explicitly includes one as a targeted responsibility.
State exclusions, including generated artifacts and non-Rust packages when applicable.
Do not convert an all-member request into a sample without approval.

### 2. Choose Categories

Load and follow the [multiselect skill](../multiselect/SKILL.md) to select among:

1. Documentation
2. Tests
3. Naming
4. Code organization
5. Implementation
6. Abstractions

Offer `ALL`.
Do not infer all categories from a broad crate scope.

### 3. Choose the Category Profile

Propose **Conservative** across the selected categories unless the user supplied another profile.
Offer:

- **Conservative everywhere:** pursue reduction through private, reversible, low-disruption changes with straightforward evidence.
- **Structural everywhere:** also pursue justified ownership, dependency, public-surface, or lifecycle restructuring with stronger validation and review.
- **Per-category overrides:** ask only for selected categories whose levels differ.

Both profiles seek to remove accidental complexity.
They control acceptable disruption and compatibility risk, not whether the pass is reduction-oriented.
Conservative does not mean preservation-biased.
An unselected category is Off.
An Off category permits only necessary supporting edits for an enabled patch.

### 4. Choose Wave Order and Patch Strategy

For multiple selected categories, offer the suggested order or a custom order.
State which categories will be patch-first and which require a proposal or prototype.
For broad Conservative documentation, test, naming, organization, and local implementation work, recommend patch-first editing.
Do not recommend a no-edit discovery wave merely because the scope is broad.

Use a preliminary read-only survey only when it answers a concrete routing question, such as ownership partitioning, generated-file boundaries, or whether a proposed structural dependency is feasible.
Do not turn that survey into a candidate inventory before editing.

### 5. Choose Execution Structure

Offer:

- **Lean parallel editing:** recommended for broad independent crate or category work. Agents edit non-overlapping scopes, return patches, and use concise session evidence. This is not a numbered parallel iteration.
- **Sequential editing:** one working scope and patch at a time with the same diff-review gates.
- **Audited parallel iteration:** numbered records, worktrees, integration, and Phase 3 under the coordination skill. Use only when the user explicitly requests that level of retained provenance.

Parallel editing does not itself require the full coordination workflow.
Load `.github/skills/rust-service-coordination/SKILL.md` only after the user explicitly selects an audited parallel iteration or asks to continue one.

### 6. Choose Checkpoint Commit Authority

Offer:

- **Commit after acceptance:** recommended for multiple checkpoints. The user grants advance authority to commit each checkpoint only after its acceptance loop passes. Never push.
- **Ask before each commit:** finish acceptance, present the result, and wait for approval.
- **Do not commit:** appropriate for one checkpoint. Preserve an immutable accepted patch and stop before starting another checkpoint.

Candidate edits must never be committed before acceptance.
Use each accepted checkpoint commit as the fixed base for the next checkpoint, including within the same wave.

### 7. Choose Workspace Isolation

Offer:

- **New worktree and branch:** recommended for broad or multi-wave work.
- **New branch in the current worktree:** requires a clean worktree and permission to switch it.
- **Current branch and worktree:** appropriate only for a dedicated clean checkout.

This choice is independent of sequential or parallel editing.
Never move or overwrite unrelated user changes.

### Announce the Resolved Configuration

Before dispatch, state:

- selected scope and exclusions;
- categories, profile, and wave order;
- patch-first and proposal-first boundaries;
- execution structure, shared or per-worker worktrees, and synchronization boundary;
- branch and worktree;
- commit authority;
- validation sets and acceptance-attempt limit; and
- prohibited API, dependency, protocol, generated, platform, and performance changes.

Derive the validation sets from [Validation](#validation) and state the default three-attempt limit per checkpoint from [Accept a Checkpoint](#accept-a-checkpoint).
Ask only if the user wants to override those defaults.

For lean parallel editing:

- give each agent non-overlapping writable paths;
- use the [shared-worktree barrier](#parallel-patch-work), or isolated worktrees and build outputs for independent edit/test loops;
- keep shared commands under one execution owner;
- do not modify tracked editor or task configuration to schedule commands; and
- assemble frozen candidate patches before checkpoint validation and review.

### Budget by Reviewability

Do not propose a default number of accepted changes.
The unit of work is a reviewable patch, not an individual comment, rename, helper, or deletion.
One documentation patch may contain hundreds of edits; one concurrency change may require its own checkpoint.

Bound work with:

- category waves;
- crate or responsibility ownership;
- maximum reviewable patch scope;
- execution time or file limits when the user requests them;
- permitted risk and boundary changes; and
- acceptance-attempt limits.

Choose a cohesive batch that fits the reviewability budget, combining small related scopes when practical rather than defaulting to one checkpoint per crate.
In a shared worktree, the concurrent editing batch is one checkpoint, with one acceptance decision and attempt allowance.
Review assignments may partition that frozen batch by crate or responsibility; they are not independently acceptable checkpoints.
Use one reviewer when the complete batch is small enough.
Follow the checkpoint-review skill's assignment rules: name a reviewer owner for every changed area and relevant cross-area interaction, and have the coordinator verify complete coverage.
If the batch is too large even for partitioned review, schedule smaller batches before editing.
Do not split a coherent mechanical transformation merely to satisfy an edit-count target.
Keep candidates for later checkpoints outside the checkout being validated and reviewed.

### Record Configuration

For a lean run, retain only:

- approved source commit;
- scope, exclusions, category profile, and waves;
- execution ownership and worktree-wide synchronization;
- checkpoint boundaries, review assignments, and review depth;
- checkpoint commit authority and workspace isolation;
- prohibited API, dependency, protocol, generated, platform, and performance changes;
- per-checkpoint and integrated validation sets; and
- explicit user limits.

Keep this in session state or an existing task record.
Do not create a repository report unless the user requests one or selects an audited parallel iteration.

For an audited parallel iteration, record the same decisions in its charter and simplification inventory.
Describe patch scopes and reviewability limits rather than an arbitrary repair count.

## Make Candidate Patches

### Establish the Baseline

Before editing:

1. record the exact source commit and worktree;
2. inspect applicable current contracts, tests, and documentation guidance;
3. identify generated, public, serialized, platform, persistence, and measured boundaries; and
4. assign non-overlapping ownership.

Distinguish the **initial run baseline**, before any simplification, from each later **checkpoint base**, which includes accepted changes from this run.

- Establish passing evidence on the initial source commit for the planned run's applicable validation gates.
  Reuse results only when they identify that exact commit, cover the required checks, and come from a compatible toolchain and environment; otherwise run the missing checks before editing.
  Documentation-only runs do not require implementation gates unless executable examples or generated inputs require them.
  Resolve initial source failures outside simplification before starting the run.
- Before later checkpoints, establish passing evidence for their checkpoint-local checks.
  Reuse matching results from the preceding accepted checkpoint and run newly required local checks against the checkpoint base.
  Do not rerun broader integrated gates merely because the base commit changed; schedule them at the boundaries described in [Validation](#validation).
  An accepted checkpoint is known to pass its recorded checks, not every broader gate.

Record the initial source commit separately from checkpoint bases, with commands, results, and evidence used or reused in the existing session state or run record.
A failure on a later checkpoint base may have been introduced by this run; follow [failure attribution](#classify-validation-failures) rather than treating it as an initial source failure.
Corrective checkpoints for confirmed in-run regressions start from recorded failing evidence, as described there.

Do not write a prose candidate list for cheap edits that can be evaluated directly in a diff.

### Edit the Full Assigned Scope

Within each assigned category and ownership scope:

- inspect every relevant file or declaration promised by the scope;
- make every supported improvement that fits the configured profile;
- leave code unchanged when the edit would only be different, shorter, or stylistic;
- keep ambiguous high-risk transformations out of the patch;
- avoid unrelated edits from later category waves; and
- inspect the resulting diff before handing it off.

The initial patch is intentionally a candidate set.
It is expected that review may correct many edits and revert some entirely.
Do not weaken the initial pass merely to avoid reviewer findings.

Apply these reduction rules:

- **Documentation:** inspect all Markdown files owned by each selected crate and the documentation and implementation-comment coverage and placement in its hand-authored source.
  Identify the intended audience and authoritative owner.
  Remove duplication, implementation narration, historical residue, misplaced detail, restatements, and qualifications that do not support a realistic reader decision.
  Then tighten retained material, relocate information to its narrowest correct owner, and add the shortest useful explanation only when a consequential gap remains.
  Generated, vendored, and build-output files are outside this hand-authored surface.
- **Tests:** identify the owning decisions, behavioral equivalence classes, and distinct boundaries protected by the original suite.
  Retain, replace, consolidate, relocate, or remove tests and assertions according to whether they detect a distinct consequential regression with useful diagnosis.
  Remove duplicate, incidental, setup-only, overfitted, and non-discriminating evidence.
  Add or rewrite tests only when needed to preserve meaningful protection through the simpler structure; route unrelated missing coverage to the quality workflow.
- **Naming:** reduce competing terminology, false distinctions, and context already supplied by the enclosing scope.
  Change a name only when responsibility, consistency, or call-site comprehension materially improves.
- **Code organization:** reduce places a maintainer must visit to understand one responsibility.
  Collapse ceremonial boundaries and forwarding layers, keep single-consumer helpers near their owner, and avoid moves that require broader visibility or more navigation.
- **Implementation:** remove mechanisms not required by documented contracts or demonstrated consumer requirements.
  Do not preserve incidental behavior solely because current tests encode it; determine whether the test is overfitted before retaining accidental implementation complexity.
  Prefer direct representation and control flow over helpers or dense expressions that merely hide the same complexity.
- **Abstractions:** directly attempt removal or collapse of private abstractions when the change is reversible.
  Retain an abstraction only when it owns meaningful variation, policy, substitution, invariants, or dependency direction.
  Use a proposal or small prototype for new shared surfaces, cross-crate ownership, or consequential public changes.

### Escalate Risky Transformations

Pause and assess before implementing a transformation that:

- changes public API or serialized shape;
- moves policy across crate ownership;
- alters protocol, persistence, generated bindings, or supported platforms;
- changes synchronization, cancellation, failure atomicity, or lifecycle ordering;
- affects allocation, copying, hashing, I/O, or work performed before rejection on a meaningful path; or
- introduces a shared abstraction, dependency, or callable surface.

For such work, state a falsifiable hypothesis and the cheapest evidence that could disprove it.
A small isolated prototype is preferable to a long speculative report when it can expose the tradeoff safely.

## Accept a Checkpoint

Use this one acceptance loop for sequential and parallel editing.
Local diff inspection and focused checks prepare the patch; they are not separate approval gates.
Use the [checkpoint-review skill](../checkpoint-review/SKILL.md) for snapshot identity, independent read-only review, finding dispositions, and commit safeguards.
Supply the category criteria below with its review input.

Default to **three frozen-state attempts per checkpoint**, including the initial attempt:

1. Pause all writers to the checkpoint worktree and wait for acknowledgment that their edits and write-producing commands have finished.
   The coordinator then assembles the complete candidate patch, including parallel contributions and integration fixes.
2. Freeze the worktree's source and validation inputs, capture the snapshot identity, and run the declared validation set.
   If validation fails, classify the failure before repairing it; do not request a review yet.
3. Once validation passes, request one fresh reviewer per declared review assignment against the same fixed checkpoint-start base and frozen snapshot.
   Give each reviewer access to the complete diff and baseline/current context, with an explicit owner for every changed area and relevant cross-area interaction.
4. Collect all review results and finish all checks before releasing writers for coordinated repairs.
   Resolve findings with evidence and batch necessary corrections or reversions; a revised candidate starts the next attempt at the worktree-wide barrier, against the same base.
5. Accept only when required validation and complete review pass on the same unchanged state with no unresolved blocking findings.
   Verify the frozen identity and combined review coverage, then commit or pause according to the configured authority.

This limit replaces the checkpoint-review skill's default repair/review allowance.
This workflow requires passing validation; it does not use the checkpoint-review skill's validation-exception option.
Validation failures and review-driven repairs share the allowance; they do not get separate loops.
All review assignments in a batch share that allowance, and every revised attempt validates and reviews the complete batch again.
Acceptance of one checkpoint does not require re-reviewing earlier unchanged checkpoints.
A later patch that changes an accepted transformation must include the affected context and renewed evidence in its own review.

### Review Criteria

Review the actual diff and relevant baseline and current context using the [category safeguards](#category-strategies) and [reduction rules](#edit-the-full-assigned-scope).
Check both preservation of essential value and removal of accidental complexity.
For changed contracts or regression evidence, include [Focused Contract-Preservation Review](../rust-service-quality-iteration/SKILL.md#focused-contract-preservation-review) in this same review, not a separate audit.

Return concrete file-and-line findings and a checkpoint disposition, not an approval or justification for every edit.
Distinguish:

- **Blocking:** lost safeguards, missing required evidence, incomplete review coverage, or a transformation that lacks a concrete simplification benefit or merely displaces complexity.
  Explain the mechanism and affected responsibility; a stylistic preference is not a blocker.
  Correct or revert the transformation.
- **Nonblocking:** additional simplification opportunities that are not needed to make the current transformation worthwhile and safe.
  These do not expand the repair loop.

If a finding reveals a repeated failure pattern, check the rest of the patch for that pattern.
Report gaps in promised scope coverage separately; acceptance of a patch does not establish completion of its wave.

### Classify Validation Failures

Passing baseline checks reduce attribution uncertainty but do not eliminate it.
Before changing source in response to a failure:

- **Environment or command problem:** restore missing dependencies or correct the command, then rerun the affected checks.
  If a corrected command lacks baseline evidence, run it against the checkpoint base too.
- **Current-candidate regression:** return the command, relevant output, failing test when applicable, baseline evidence, and current patch to the implementer for repair within the checkpoint allowance.
- **Unclear attribution:** reproduce the smallest failing command against the checkpoint base in a clean checkout.
  If it fails there, compare earlier accepted states and the initial source commit to distinguish an in-run regression from an initial source failure.
  Trace the responsible change or interaction; failure on the latest accepted base does not establish that it predates the run.
  One diagnostic rerun may help investigate a potentially flaky test; a passing rerun alone does not resolve the failure.
- **Regression in earlier accepted work:** stop forward progress and repair or revert the responsible transformation within simplification.
  For committed work, use a corrective checkpoint on the latest accepted commit, preserving any pending candidate separately; do not rewrite accepted history.
  Give it the normal bounded acceptance loop, including the newly failing check and affected validation.
  Record the failing starting evidence instead of requiring that known-broken check to pass before the corrective edit.
  For uncommitted accepted work, reopen its acceptance loop against its original base.
  After correction, adapt and revalidate dependent candidates before resuming.
- **Initial source failure or unresolved attribution:** pause, preserve the patch and failure evidence, and report the blocker.
  Only failures shown to predate this run are routed outside simplification for source repair.
  Resume after attribution and resolution, re-establishing the initial baseline if an external repair changes it.

Do not weaken, delete, skip, or add retries to a test merely to accept a simplification.
Environment restoration, evidence collection, one diagnostic flaky rerun, and report-only corrections do not consume a candidate attempt.
Substantive source or test repairs create a new candidate state and use the next attempt.

If all attempts fail, stop before committing or starting another checkpoint and ask the user to choose:

- revert only the current checkpoint patch, leaving earlier accepted checkpoints intact;
- preserve the patch and pause; or
- authorize another bounded repair loop for the simplification.

Recommend reverting the candidate, or the responsible accepted transformation when repairing an earlier regression.
Abandoning a corrective candidate does not resolve the earlier regression; keep forward progress blocked until a repair or revert passes acceptance.
Do not waive required validation or unresolved blocking findings to accept the checkpoint.

## Parallel Patch Work

Partition by non-overlapping crate or responsibility ownership, not by overlapping techniques.
Non-overlapping files do not isolate source dependencies, generated inputs, or build outputs.

**Shared worktree:** alternate parallel editing with a worktree-wide validation/review phase.
Workers stop writing and acknowledge the barrier before the coordinator runs checks or starts reviews.
Keep all writers paused until validation, review, and acceptance finish, or the coordinator explicitly opens a repair phase after all checks and reviews have stopped.
This barrier also applies to focused compilation and tests during local editing; do not run one worker's checks against another worker's moving source.
Read-only reviewers may work concurrently on the frozen batch, but all command execution stays under one owner, who serializes commands with conflicting outputs.

**Isolated worktrees:** workers may run independent edit/test loops only when their source trees, generated directories, and build outputs are isolated.
They return frozen patches and focused check results; the coordinator assembles them in the checkpoint worktree before [acceptance](#accept-a-checkpoint).
Adapt contributions prepared against an older base before freezing, then validate and review the actual assembled diff.
Independent work elsewhere may continue only if it cannot modify that worktree's inputs or outputs.

Assembly is not acceptance: neither mode requires independent review or candidate commits before assembly.
If any source or validation input changes while frozen, invalidate the attempt's evidence and re-enter the acceptance loop; do not silently accept mixed-state results or revert another worker's edits.
Validation may regenerate declared build artifacts from frozen inputs, including artifacts consumed by later checks.
Changes to source or other frozen inputs require a new freeze.

Audited runs use this source-change acceptance loop too; coordination records and integration checks do not add a per-agent candidate-approval gate.
Agents may report significant high-risk skipped transformations, but should not produce exhaustive no-change or candidate prose.
Cross-crate changes need one explicit owner and a later patch.
Do not let multiple workstreams create competing shared abstractions.

## Validation

Declare each checkpoint's validation set before editing using [the development guide's affected-surface requirements](../../../rust-service/DEVELOPMENT.md#checkpoint-and-documentation-checks).
The category name does not exempt executable examples, generated inputs, or consumers from their required checks.
Run the smallest useful checks during local editing under the worktree synchronization rules.
For test simplification, also account for consequential behavioral obligations before and after, verify that retained cases execute, and provide proportionate failure-detection evidence.
After review-driven edits, the next attempt reruns the complete declared set.
Passing tests does not establish preserved test quality; the review must still compare behavioral obligations, independent expectations, execution gates, diagnosis, and potentially redundant evidence.

Validate just in time.
Verify the initial run baseline once, then establish checkpoint-local evidence as described in [Establish the Baseline](#establish-the-baseline).
Do not repeat initial integrated validation before every checkpoint or run implementation gates for documentation-only work that does not affect executable examples or generated inputs.
Use focused baseline reproductions when later failures need attribution, test discovery changes, or behavior needs characterization.

Declare broader gate boundaries with the validation plan: run them at an affected checkpoint when its safety depends on them, at planned wave or integration-batch boundaries, and before completion.
Select the applicable gates and safe command concurrency from [the development guide](../../../rust-service/DEVELOPMENT.md#canonical-rust-checks).
Matching results on the same frozen state may satisfy more than one boundary without rerunning commands.
Failures at these boundaries use the same attribution and corrective-checkpoint rules as local failures.
Do not rerun source validation after record-only changes.

Missing worktree dependencies are environment setup failures, not source failures.
Preflight required dependency installations before expensive validation, use frozen lockfiles, and verify manifests and lockfiles remain unchanged.

## Evidence and Records

Git commits, fixed-base patches, review findings, and command results are the primary evidence.
Do not duplicate information that can be read directly from those artifacts.

For a lean run, the final response should state:

- source and final commits or patch identities;
- completed scope and any explicit gaps;
- representative accepted and reverted edits;
- reviewer findings and dispositions;
- validation outcomes; and
- whether another category wave is justified.

Do not create a candidate inventory, retrospective, skill review, or Phase 3 report unless requested.

For an explicitly audited parallel iteration, initialize the coordination records and simplification inventory:

```bash
node .github/skills/rust-service-coordination/scripts/iteration-records.mjs init-simplification NNNN
```

Use `assets/simplification-inventory.template.md`.
Keep it concise:

- one row per reviewable patch or significant rejected structural hypothesis, not per small edit;
- one scope row per ownership area, not a crate-by-category matrix;
- links to commits, diffs, reviews, and command evidence instead of repeated prose;
- significant deferrals and revisit triggers only; and
- no exhaustive catalog of unchanged declarations or cosmetic possibilities.

Then run:

```bash
node .github/skills/rust-service-coordination/scripts/iteration-records.mjs validate-simplification NNNN
```

The validator checks record structure, not semantic freshness.
Before completion, compare recorded commits and status with Git and correct stale statements once.

## Assess Results and Convergence

Assess:

- **Coverage:** promised ownership and category waves completed, with explicit gaps.
- **Value:** accidental complexity removed, essential complexity preserved, and any introduced or displaced complexity visible in the accepted diff.
- **Safety:** review findings, reversions, validation, and unresolved evidence gaps.
- **Effort:** implementation, review, validation, rework, and coordination costs.
- **Recommendation:** stop, continue the next configured wave, or pursue one specific risky transformation.

A run is converging when accepted patches reduce accidental complexity without displacing it, review retains worthwhile edits and rejects weak transformations, and later patches expose fewer repeated problems.
A large initial patch followed by substantial correction can be a successful result.
Do not infer value from edit count, and do not infer failure merely because review reverted many candidate edits.

Stop when:

- the promised waves are complete;
- remaining edits are stylistic, ambiguous, or lower value than their review cost;
- high-risk opportunities lack the required contract or evidence; or
- another pass over the same scope is unlikely to produce a materially better retained diff.

Recommend another run only for a specific remaining category wave, repeated reviewer finding, or supported structural hypothesis.

When assessing the skill itself, treat repeated failure to follow cumbersome instructions as possible workflow-design evidence, not automatically as operator error.
For each proposed improvement, distinguish unclear guidance, excessive process, missing domain knowledge, execution failure, and tool limitation.
