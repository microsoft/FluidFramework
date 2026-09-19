---
name: rust-service-coordination
description: 'Choose between lightweight direct work and a full Rust service iteration, or coordinate Phase 2 and Phase 3 iterations including validation, workstreams, worktrees, integration, reports, retrospectives, and decisions. Use when deciding whether iteration overhead is justified, or when starting, implementing, validating, integrating, recovering, or closing a rust-service iteration.'
argument-hint: 'choose lightweight work or run an iteration, integration, or review workflow'
---

# Rust Service Coordination

Use this workflow to decide whether work needs a numbered iteration and to run
every numbered iteration under `rust-service/historical/iterations/`.
Keep active and completed records in that location and continue the existing four-digit numbering sequence.
The archived plans and foundation report are historical evidence, not prerequisites or current design authority.

## Choose the Workflow

Do not initialize an iteration merely because work follows a completed iteration
or concerns the Rust service. Choose the lightest workflow that preserves the
evidence and coordination the task needs.

Use lightweight direct work on the current branch when all of these are true:

- one owner can perform the work sequentially;
- there are no dependency-independent implementation workstreams worth running
   concurrently;
- no separate integration branch or cross-workstream reconciliation is needed;
- the task does not need an immutable Phase 2 boundary followed by a distinct
   multi-input Phase 3 synthesis; and
- focused commits, tests, and proportionate documentation can preserve the
   result.

For lightweight work, do not create iteration records, an integration branch, or
workstream worktrees. Keep normal implementation and validation evidence in the
most local durable artifact: code and tests for a fix, an adjacent README or
benchmark report for retained measurements, and a decision or `LEARNINGS.md`
entry only when their existing triggers apply.

For every behavior change or bug fix, identify the contract consumers rely on
and inspect each changed production crate for proportionate documentation and
regression evidence. Prefer a focused test in the owning module or crate, add a
conformance test when multiple implementations share the guarantee, and retain
integration, generated-binding, or browser coverage only when it proves a
distinct boundary. If a changed crate needs no documentation or test change,
record why existing evidence is sufficient or why another boundary owns the
guarantee. Follow the full policy in `rust-service/DEVELOPMENT.md`.

Before completing any Rust-service implementation or integration, run the
canonical validation in `rust-service/DEVELOPMENT.md` and, from the repository
root, run:

```bash
pnpm policy-check --path rust-service
```

Run `pnpm build:fast` from the repository root when changed files affect a
registered pnpm package or any declared input to its build tasks. This includes
changes to package manifests, task definitions, workspace or lock files, and
Rust sources or manifests consumed by generated WASM tasks. A package-scoped
build does not replace this check. Documentation-only changes outside registered
package build inputs do not require the repository build.

A full iteration may provide material value when work has two or more genuinely
independent workstreams, benefits from parallel agents, has meaningful ownership
or integration risk, compares multiple implementations that need normalized
reports, or needs an explicit implementation-to-synthesis decision boundary.
One sequential workstream by itself is not sufficient justification.

Honor an explicit user request to use or avoid an iteration. When a full
iteration may provide material value but the user has not explicitly requested
one, present the lightweight and iteration options with the concrete benefit and
overhead, then ask the user which workflow to use before creating iteration
records, branches, or worktrees. Do not silently decide either way. If iteration
value emerges after lightweight work begins, pause before converting the task
and ask the same question.

Once the user selects a full iteration, follow the remaining sections of this
skill. Existing iteration records remain append-only historical artifacts.

For a risk-driven contract and regression-test audit, also use the [quality-iteration skill](../rust-service-quality-iteration/SKILL.md).
It defines boundary selection, evidence, inventory dispositions, and convergence; this skill remains the authority for iteration mechanics.

## Invariants

- Start all workstream branches and worktrees from the same approved iteration base.
- Give every workstream explicit writable paths and expected evidence.
- Treat iteration records and accepted decision records as append-only history.
- Record evidence while work is occurring; do not rely on an end-of-iteration reconstruction.
- Record only observed metadata. Write `unknown` when elapsed time, model identity, token use, or another datum is unavailable.
- Do not use full chat transcripts as the primary project record. Link a session identifier or transcript only when it materially supports a finding and contains no sensitive data.
- Do not silently retry ambiguous appends, rewrite another workstream's commits, or change shared semantics outside the Phase 3 decision process.

## Clean-Context Entry

1. Read `rust-service/README.md` and `rust-service/SEA_ARCHITECTURE.md` for current purpose, contracts, and boundaries.
2. Read `rust-service/DEVELOPMENT.md` for toolchain, lockfile, quality, and validation policy.
3. Read `rust-service/KNOWN_ISSUES.md` and the relevant crate guides for current limitations.
4. For an existing iteration, read its manifest, charter, and reports under `rust-service/historical/iterations/NNNN/`.
5. Check repository status and the current Rust toolchain before editing.

Do not require prior conversation context or archived migration plans.
Consult historical evidence only when a concrete question needs it, and verify its conclusions against current contracts and code.
Proceed on reversible local implementation details and settled requirements.
Ask the user when evidence leaves materially different shared semantic or public-contract choices, or when changing approved scope.
Record the alternatives, evidence, and downstream consequences with the question.

## Start an Iteration

1. Identify and validate the latest approved repository state. This is the
   foundation or previous Phase 3 commit plus any accepted lightweight commits
   that must be included in the new work.
2. Select active workstreams and pre-register their hypotheses, dependencies, expected evidence, and stopping conditions.
3. Run:

   ```bash
   node .github/skills/rust-service-coordination/scripts/iteration-records.mjs init NNNN workstream-name...
   ```

4. Set `sourceCommit` to that approved base commit, complete `charter.md` and each generated instruction, and set manifest status to `active`.
   For a quality iteration, also run `iteration-records.mjs init-quality NNNN` using the script path above before committing the kickoff records.
   Complete the inventory's configuration and selection rationale; workstreams fill reviewed boundaries during the audit.
5. Run `node .github/skills/rust-service-coordination/scripts/iteration-records.mjs validate NNNN start`.
6. Commit the initialized records as the iteration kickoff, then create the integration branch and isolated worktrees from that kickoff commit using the Worktrees section below.
7. Give each agent its generated instruction file and report path.
8. Use write-capable agents for implementation workstreams. Reserve read-only
   exploration agents for audits, review, and status reporting.
9. Dispatch every dependency-independent workstream concurrently. Organize
   dependent work into explicit charter waves, and run the cheapest end-to-end
   prerequisite probe before dispatching a consumer whose primary evidence
   depends on unproven runtime behavior.

Use [iteration charter template](./assets/iteration-charter.template.md) and [workstream instructions template](./assets/workstream-instructions.template.md) for field guidance.

## Worktrees

Use `rust-service-iteration-NNNN` for the integration branch and append `-<workstream>` for each workstream branch.
Keep worktrees outside the primary checkout, with explicit non-overlapping ownership.
Agents must not merge, rebase, force-push, or modify another workstream or the integration branch.
Shared contract, workspace, and dependency changes require explicit ownership; otherwise report them for coordinator review.

Before creating branches, verify that every proposed ref is available. Create the integration branch and worktree from the kickoff commit, then create every workstream from that same commit:

```bash
git show-ref --verify --quiet refs/heads/rust-service-iteration-NNNN && exit 1
git branch rust-service-iteration-NNNN <kickoff-commit>
git worktree add ../FluidFramework-rust-service-iteration-NNNN rust-service-iteration-NNNN
git worktree add -b rust-service-iteration-NNNN-<workstream> ../FluidFramework-rust-service-iteration-NNNN-<workstream> <kickoff-commit>
```

Record the actual branch, worktree, and kickoff commit in each workstream report before implementation. Generated instructions may cite the prior approved source commit; the report is authoritative for the worktree's actual kickoff provenance.

Before removing a completed worktree, verify that its report accounts for all changes and that `git -C <worktree-path> status --short` is empty. Then run:

```bash
git worktree remove <worktree-path>
git worktree prune
```

Never use forced removal to bypass uncommitted or untracked files. Do not delete the workstream branch until its disposition and commits are recorded in the integration report.

## Run a Workstream

1. Record branch, worktree, base commit, agent/instruction provenance, initial hypothesis, and planned checks before substantive implementation.
2. Keep implementation commits coherent and independently reviewable.
3. Before changing behavior, identify the relied-upon contract and the narrowest
   responsible implementation boundary. Plan focused owning-module or
   owning-crate regression evidence first, then shared conformance or broader
   integration evidence only where it proves an additional responsibility.
4. For every changed production crate, update its report with the contract and
   test evidence added, or explain why existing evidence is sufficient or a
   different boundary owns the guarantee.
5. Update the workstream report when any of these occurs:
   - a hypothesis is falsified;
   - three materially similar attempts fail;
   - an issue consumes substantial effort relative to the workstream;
   - user intervention or a shared-contract decision is required;
   - an undocumented workaround or cross-workstream dependency appears; or
   - a reusable technique or candidate skill is discovered.
6. For each notable event, capture the attempted approach, evidence, impact, resolution or current state, and reusable lesson. Prefer commands, test names, commits, and artifact links over narrative memory.
7. Create a decision record in `rust-service/historical/decisions/` from [the decision template](./assets/decision-record.template.md) when the outcome changes shared semantics, APIs, crate boundaries, conformance, iteration scope, or coordination policy. Use the next globally increasing four-digit identifier and a short slug; follow the decision directory's README.
8. Finish with the report template complete and the worktree clean, or enumerate every remaining artifact.

For delegated commands in repositories with multiple worktrees, make the command itself use the assigned absolute path and print the absolute worktree path, `git branch --show-current`, HEAD, and status before running work. Assert the expected branch and base when applicable, and stop on mismatch. Do not accept summarized validation output that omits this guard output, exit status, or the requested test result. When the workstream may edit a crate manifest but does not own the shared lockfile, validate in an exact disposable copy and immediately verify that the assigned worktree's lockfile is unchanged.

When accepting a delegated implementation or review, inspect the named Git
object directly and compare its changed paths with the workstream ownership and
report. Review prose without evidence of the named commit or checkout is not
integration evidence.

When a workstream retains machine-readable evidence, directly verify the
expected files, nonzero size, parse success, provenance, and declared domain
invariants before accepting the producer's summary. The workstream instructions
must define those invariants because benchmark, trace, and comparison schemas
differ.

For Node or pnpm validation in an isolated worktree, prefer a worktree-local
`pnpm install --frozen-lockfile` so workspace-relative package links resolve
inside that checkout. If the full install is disproportionate, link each required
package to an absolute installed target and record the workaround and cleanup;
do not rely on an outer `node_modules` symlink because pnpm's nested relative
links may resolve against the wrong worktree. In either case, verify shared
lockfiles are unchanged. A successful cached build does not prove ignored
worktree-local outputs exist: generate or verify nonzero exact outputs and execute
the exact consumer.

Use [workstream report template](./assets/workstream-report.template.md).

## Integrate Phase 2

1. Review and integrate accepted commits in dependency order.
2. For every accepted behavior change or bug fix, verify that the relied-upon
   contract is documented at its owning boundary and that each changed
   production crate has proportionate focused regression evidence or a recorded
   rationale for relying on existing or differently owned evidence. Verify that
   conformance and broader integration tests prove distinct responsibilities
   rather than substituting for practical localized coverage. For an
   `already adequate` conclusion, require the exact owning decision and the
   nearest test that would fail if only that decision regressed; topical
   coverage that another component can satisfy is insufficient.
3. Record rejected or deferred work, conflict resolution, cross-workstream adaptations, and validation results in `phase-2/integration.md`.
4. Set the manifest status to `phase-2-complete`.
5. Run:

   ```bash
   node .github/skills/rust-service-coordination/scripts/iteration-records.mjs validate NNNN phase-2
   ```

6. Run workspace-level validation and commit the integration boundary only after the artifact check passes.

Workspace-level validation must include the canonical format, strict
workspace/all-target/all-feature Clippy, rustdoc, build, test, and documentation checks in
`rust-service/DEVELOPMENT.md`. Package-scoped checks do not replace this gate.
It must also include the scoped repository policy check and, when the changed
files affect the registered pnpm or declarative build graph, the repository-root
`pnpm build:fast` command described there.
When downstream tests consume ignored generated packages or build outputs,
regenerate them in the integration checkout and execute or inspect the exact
consumer artifact rather than relying on a source build or cached output.
Explicitly remove temporary symlinks, copied dependencies, processes, and
command-scoped environment overrides; persistent terminals may not run shell
exit traps when expected.

Use [integration report template](./assets/integration-report.template.md).

## Conduct Phase 3

1. Compare the charter's hypotheses with observed results.
2. Separate implementation defects from shared-abstraction limitations, and
   assess whether accepted tests and documentation capture the contracts that
   consumers actually rely on at the narrowest practical owning boundaries.
3. Review every costly issue, human intervention, workaround, and proposed decision.
4. Create or update decision records and link them from the Phase 3 report.
5. Decide interactively which workstreams to keep, remove, replace, or add next.
6. Complete the retrospective and promote durable lessons to `rust-service/LEARNINGS.md`.
7. Review candidate skills and coordination friction, including unresolved
   candidates and next-review triggers from prior iterations. Record accepted,
   rejected, and deferred changes in `skill-review.md`. For each accepted
   lesson, verify whether it belongs in this skill, a generated template,
   validation policy, `LEARNINGS.md`, or only local instructions; apply it to
   the reusable surface when supported by evidence, and record the validation.
8. If a next iteration is justified and approved, create instructions for each next-iteration workstream with:

   ```bash
   node .github/skills/rust-service-coordination/scripts/iteration-records.mjs next NNNN workstream-name...
   ```

   Complete the generated instructions.
   If no next iteration is approved, leave `nextWorkstreams` empty and record the stopping decision or revisit trigger in the Phase 3 report.
   In either case, set manifest status to `complete`.
9. Run:

   ```bash
   node .github/skills/rust-service-coordination/scripts/iteration-records.mjs validate NNNN complete
   ```

10. Commit the Phase 3 artifacts as the immutable base for the next iteration.

Use the [Phase 3 report](./assets/phase-3-report.template.md), [retrospective](./assets/retrospective.template.md), and [skill review](./assets/skill-review.template.md) templates.

## Recovery

- **Abandoned workstream:** preserve its branch, commits, report, failed checks, and reason for stopping; mark it rejected or deferred in integration.
- **Blocked workstream:** minimize the blocker into a test or precise requirement, continue independent work only, and escalate under the plan's mid-iteration process.
- **Dirty worktree:** never discard unknown changes. Enumerate them in the report and ask the coordinator to resolve ownership.
- **Partial integration:** record accepted commit ranges and unresolved conflicts before resuming; do not force-push or rewrite reported workstream history.
- **Missing report:** do not reconstruct unsupported details. Mark unknown fields explicitly and capture only evidence that remains available.
- **Temporary validation state:** do not rely on shell exit traps in persistent
   terminals. Explicitly remove temporary files and symlinks, stop owned
   processes, restore command-scoped environment, and verify checkout status.

## Validation

The validator checks required files, manifest/report correspondence, required section headings, unresolved template markers, and decision links. It does not prove that claims are accurate; reviewers must compare reports with commits and command output.
