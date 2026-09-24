---
name: rust-service-simplification-iteration
description: 'Design and run a patch-first Rust-service simplification iteration across documentation, tests, implementations, abstractions, code organization, and naming while preserving behavior and proportionate regression evidence. Use when configuring, executing, reviewing, or repeating simplification, consolidation, deduplication, code-size reduction, or broad cleanup across rust-service crates.'
argument-hint: 'configure or run a Rust-service simplification and consolidation pass'
---

# Rust Service Simplification Iteration

Use this workflow to make Rust-service code, tests, and documentation easier to understand and maintain without weakening behavior, diagnostics, performance, or supported platforms.
Read `rust-service/DEVELOPMENT.md` for the quality bar and validation requirements.

The default workflow is **patch first**:

1. assign a reviewable category and ownership scope;
2. make all supported improvements in that scope;
3. review the complete fixed-base diff;
4. correct or revert edits that do not satisfy the category safeguards; and
5. retain only the accepted patch.

The diff is the primary proposal and review artifact.
Do not require an English candidate description before making a cheap, reversible local edit.
Use proposal-first assessment only when implementation is expensive, crosses ownership, or could change a public, protocol, persistence, concurrency, platform, generated, or performance boundary.

Pin an approved source commit so every patch has a reproducible before-and-after comparison.
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

Use one primary category for each reviewable patch.
Organize broad work into category waves so reviewers can apply coherent criteria to the complete diff.

| Category | Default strategy | Intended improvements | Required safeguards |
| --- | --- | --- | --- |
| Documentation | Patch first | Review all Markdown files owned by each selected crate and the documentation and implementation-comment coverage and placement in its hand-authored source. Determine whether comments should be added, revised, preserved, relocated, consolidated, or removed according to repository policy. | Aim for the appropriate documentation state, not maximum comment coverage. Preserve contracts, qualifications, examples, useful local context, non-obvious implementation reasoning, and discoverability. Account for inherited and authoritative documentation before treating a location as undocumented. Do not add comments that merely restate the code, and remove such comments when they add no value. Shorter is not automatically better. |
| Tests | Patch first | Simplify fixtures and setup, factor repetition, and use table-driven cases when clearer. | Preserve cases, discriminating assertions, execution, independence, and failure diagnosis. |
| Naming | Patch first for private/local names | Use names that describe actual responsibility and meaning. | Check public APIs, serialization, reflection, generated consumers, and call-site clarity. |
| Code organization | Patch first for local mechanical cleanup | Move code to better owners, simplify imports and exports, and remove unnecessary files. | Keep moves lossless; check comments, visibility, initialization, dependency direction, and build inclusion. |
| Implementation | Patch first for local mechanics; proposal first for risky boundaries | Simplify control flow, deduplicate owned logic, and remove unnecessary state, clones, branches, conversions, or dead paths. | Preserve evaluation order, errors, side effects, resource lifetimes, concurrency, and performance. |
| Abstractions | Proposal or small prototype first | Remove unnecessary layers and consolidate responsibilities that must evolve together. | Similar syntax is not shared ownership. Avoid new indirection, configuration, visibility, or dependencies that outweigh the reduction. |

Suggested broad-wave order:

1. documentation;
2. tests;
3. naming and local code organization;
4. local implementation;
5. abstractions and cross-crate consolidation.

Finish review and integration of one wave before a later wave obscures its diff.
Combine categories only when supporting edits are inseparable and the combined patch remains easy to review.

## Configure One Run

Resolve every configuration dimension below before editing.
Ask one question at a time and do not bundle decisions into one answer.
Never treat selection of scope or execution structure as approval of categories, profile, wave order, commit authority, isolation, validation scope, or change constraints.
Skip only a decision the user already supplied explicitly or that is inapplicable, such as wave order for one category.

### 1. Choose Scope

Offer:

- **Broad current-state pass:** edit selected workspace members, including unchanged code.
- **Targeted pass:** edit selected crates, responsibilities, or forms of complexity.
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

- **Conservative everywhere:** clear improvements with low disruption and straightforward evidence.
- **Structural everywhere:** also attempt justified restructuring with stronger validation and review.
- **Per-category overrides:** ask only for selected categories whose levels differ.

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

- **Commit after acceptance:** recommended for multi-wave work. The user grants advance authority to commit a category only after its acceptance loop passes. Never push.
- **Ask before each commit:** finish acceptance, present the result, and wait for approval.
- **Do not commit:** appropriate for a short single wave. For multiple waves, preserve an immutable patch and stop before the next wave.

Candidate edits must never be committed before acceptance.
Use each accepted category commit as the fixed base for the next category.

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
- execution structure;
- branch and worktree;
- commit authority;
- validation sets and acceptance-attempt limit; and
- prohibited API, dependency, protocol, generated, platform, and performance changes.

Derive the validation sets from [Validation](#validation) and state the default three-attempt limit from [Accept a Category Patch](#accept-a-category-patch).
Ask only if the user wants to override those defaults.

For lean parallel editing:

- give each agent non-overlapping writable paths;
- use isolated worktrees when concurrent writes or independent commits require them;
- keep shared commands under one execution owner;
- do not modify tracked editor or task configuration to schedule commands; and
- integrate only frozen, reviewed patches.

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

Split a patch when one reviewer cannot inspect the complete diff and relevant context with confidence, or when independent transformations need different evidence.
Do not split a coherent mechanical transformation merely to satisfy an edit-count target.

### Record Configuration

For a lean run, retain only:

- approved source commit;
- scope, exclusions, category profile, and waves;
- execution ownership;
- patch boundaries and review depth;
- checkpoint commit authority and workspace isolation;
- prohibited API, dependency, protocol, generated, platform, and performance changes;
- per-category and integrated validation sets; and
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

For broad documentation work, inspect all Markdown files owned by each selected crate and the documentation and implementation-comment coverage and placement in its hand-authored source.
Apply the repository documentation and coding policies to decide whether each location needs no comment or a comment that should be added, revised, preserved, relocated, consolidated, or removed.
Account for inherited documentation and other authoritative owners before treating a location as undocumented or adding a duplicate comment.
Generated, vendored, and build-output files are outside this hand-authored surface.
For broad test work, directly simplify fixtures, setup, and cases where the revised code is plausibly clearer.
For local implementation work, directly remove supported accidental mechanics.

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

## Accept a Category Patch

Use one bounded acceptance loop for compiler, formatter, Clippy, rustdoc, test, documentation, policy, and adversarial-review feedback.
A category checkpoint is accepted only when its declared validation set passes and a fresh fixed-base review then reports no blocking findings on the same unchanged patch.

Default to **three frozen-state attempts total**:

1. freeze the complete category patch;
2. run its declared category validation;
3. if validation fails, return diagnostics to the implementer and do not spend a review;
4. if validation passes, use the [checkpoint-review skill](../checkpoint-review/SKILL.md) for a fresh read-only review;
5. if review requests changes, return the findings to the implementer;
6. after any substantive edit or revert, increment the attempt count and restart at validation; and
7. when validation and review pass consecutively on one unchanged state, commit or pause according to the configured authority.

This single limit replaces the checkpoint-review skill's default repair/review allowance for this workflow.
A validation-only failed state and every state sent to review draw from the same three attempts; do not add separate review rounds.

The reviewer must inspect the complete diff, relevant baseline and current context, prior findings and dispositions on later attempts, and the applicable category safeguards.
Verify the frozen state before accepting the review.
Do not substitute an implementer's prose summary for the diff.

Group cheap related edits by category and ownership so one review can assess the complete transformation.
Give high-risk structural changes separate checkpoints.
Ask the reviewer to return concrete file-and-line findings and identify:

- edits that should be retained;
- edits that need correction;
- edits that should be reverted because benefit is unclear or safeguards were lost;
- repeated failure patterns that may affect the rest of the patch; and
- missed edits only when they are clearly within the promised scope.

Apply these challenges:

| Category | Diff-review challenges |
| --- | --- |
| Documentation | Did the patch cover the promised Markdown and hand-authored comment surface and reach the appropriate documentation state? Did it account for inherited and authoritative documentation before adding comments? Were requirements, qualifications, precise terms, examples, non-obvious implementation reasoning, or useful local context lost? Were redundant, misplaced, or code-restating comments retained or added? Is the result clearer rather than merely shorter? |
| Tests | Are old cases and discriminating assertions preserved and still executed? Did sharing hide expectations, state, or failure location? |
| Naming | Does the new name improve responsibility and call-site clarity? Could it affect public, serialized, reflected, or generated names? |
| Code organization | Was movement lossless, including comments and attributes? Is the destination a better owner, and are visibility and dependency direction preserved? |
| Implementation | Are edge cases, evaluation order, errors, side effects, resource lifetimes, concurrency, and performance preserved? |
| Abstractions | Must the responsibilities evolve together? Did the patch remove concepts, or add indirection, configuration, coupling, or navigation? |

For changed contracts or regression evidence, include the quality skill's focused contract-preservation questions in the same review.
Do not start a separate quality audit.

### Classify Validation Failures

Before editing in response to a failure, classify it as introduced, pre-existing, environmental, potentially flaky, or unclear.
When attribution is unclear, reproduce the smallest failing command against the category base in a clean checkout.

- Restore missing dependencies or correct an invalid command without consuming an attempt.
- Rerun a potentially flaky test once for diagnosis; never rerun until green.
- For an introduced failure, provide the exact command, relevant output, failing test, base result, and current patch to the implementer.
- Do not weaken, delete, skip, or add retries to a test merely to accept a simplification.

Environment restoration, evidence collection, one diagnostic flaky rerun, and report-only corrections do not consume an attempt because they do not create a new patch state.
Any substantive source or test edit does.

If all attempts fail, stop before committing or starting the next wave and ask the user to choose:

- revert only the current category patch;
- preserve the patch and pause;
- expand scope and authorize another bounded loop; or
- accept an explicit documented exception.

Recommend reverting.
Never accept an introduced deterministic regression as an exception or describe an excepted checkpoint as fully validated.

## Parallel Patch Work

Partition by non-overlapping crate or responsibility ownership, not by overlapping techniques.
Within a broad category wave:

1. dispatch write-capable agents to edit their full owned scopes;
2. let each agent return its patch and focused checks;
3. integrate the category candidate patch;
4. run the bounded category acceptance loop on the complete integrated diff; and
5. create or request the accepted category checkpoint commit before the next wave.

Agents may report a small number of high-risk skipped transformations, but should not produce exhaustive no-change or candidate prose.
Cross-crate changes need one explicit owner and a later patch.
Do not let multiple workstreams create competing shared abstractions.

## Validation

Declare each category validation set before editing.
Run the smallest useful check during local editing, then use these acceptance minimums:

- **Documentation-only:** documentation checks, rustdoc, and applicable doctests.
- **Tests:** formatting and compilation as applicable, complete tests for every changed crate, unchanged test discovery and case enumeration, and proportionate failure-detection evidence.
- **Naming and code organization:** formatting, Clippy or compilation, and complete tests for every changed crate.
- **Implementation and abstractions:** formatting, Clippy or compilation, complete tests for every changed crate, directly affected dependent-crate tests, and boundary-specific checks.

Every category that changes Rust code or tests must pass the complete affected-crate test suites before acceptance and before the next category begins.
After review-driven edits, the next attempt reruns the complete declared set.
Passing tests does not establish preserved test quality; the review must still compare cases, assertions, execution gates, and diagnosis.

Validate just in time.
Do not run a full pre-change workspace baseline for a documentation wave or preflight later waves.
Run a baseline suite only when needed to distinguish existing failures, preserve test discovery, or characterize behavior.

At the integrated boundary, run all applicable canonical commands from `rust-service/DEVELOPMENT.md`.
For ordinary Rust changes, use its scoped native and Rust-service TypeScript/WASM package gate plus the explicit repository policy check.
Run the extended integration/browser gate or a repository-wide build only when required by the affected boundary.
The native workspace tests, scoped TypeScript/WASM build and tests, and policy check may run concurrently when their output paths do not conflict.
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
- **Value:** concrete clarity or mechanism improvements visible in the accepted diff.
- **Safety:** review findings, reversions, validation, and unresolved evidence gaps.
- **Effort:** implementation, review, validation, rework, and coordination costs.
- **Recommendation:** stop, continue the next configured wave, or pursue one specific risky transformation.

A run is converging when review retains worthwhile edits, rejects weak transformations, and later patches expose fewer repeated problems.
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
