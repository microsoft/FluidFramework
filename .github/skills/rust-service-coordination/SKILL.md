---
name: rust-service-coordination
description: 'Choose between lightweight direct work and a full Rust service iteration, or coordinate Phase 1 and Phase 2 or Phase 3 iterations including validation, workstreams, worktrees, integration, reports, retrospectives, and decisions. Use when deciding whether iteration overhead is justified, or when starting, implementing, validating, integrating, recovering, or closing the rust-service foundation or an iteration.'
argument-hint: 'choose lightweight work or run an iteration, integration, or review workflow'
---

# Rust Service Coordination

Use this workflow to decide whether work needs a numbered iteration and to run
every numbered iteration under `rust-service/iterations/`.

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

## Invariants

- Start all workstream branches and worktrees from the same approved iteration base.
- Give every workstream explicit writable paths and expected evidence.
- Treat iteration records and accepted decision records as append-only history.
- Record evidence while work is occurring; do not rely on an end-of-iteration reconstruction.
- Record only observed metadata. Write `unknown` when elapsed time, model identity, token use, or another datum is unavailable.
- Do not use full chat transcripts as the primary project record. Link a session identifier or transcript only when it materially supports a finding and contains no sensitive data.
- Do not silently retry ambiguous appends, rewrite another workstream's commits, or change shared semantics outside the Phase 3 decision process.

## Conduct the Foundation Phase

Phase 1 is interactive but still produces a research record. Start from [the foundation report template](./assets/foundation-report.template.md) and maintain `rust-service/foundation-report.md` while implementing the workspace.

### Clean-Context Entry

For a request to implement Phase 1, establish context in this order:

1. Read `rust-service/PLAN.md`, especially the purpose, semantic laws, Phase 1 operating contract, early research questions, and non-goals.
2. Read `rust-service/DEVELOPMENT.md` for toolchain, lockfile, and command policy.
3. Read `rust-service/foundation-report.md` for current hypotheses, decisions, evidence, and open blockers.
4. Check repository status and the current Rust toolchain before editing.
5. Consult `rust-service/README.md`, `notes.md`, `notes2.md`, or existing Fluid code only when a concrete implementation question needs that context.

Do not require prior conversation context. Use one primary agent on the current branch, do not initialize iteration `0001`, and do not create Phase 2 worktrees during the foundation.

Proceed without asking on reversible scaffolding, local implementation details, tests, and settled requirements. Prefer a small experiment before escalating an uncertain design. Ask the user when evidence leaves multiple materially different shared semantic or public-contract choices, when changing Phase 1 scope, and at the final readiness review. Document the alternatives, evidence, and downstream consequences with the question.

Use the same notable-event triggers as a Phase 2 workstream. Record API hypotheses and cheap checks before editing, then capture falsified hypotheses, repeated failures, substantial effort sinks, human interventions, decisions, and candidate skills as they occur.

Before the foundation commit:

1. Present shared decisions, unresolved questions, validation results, and proposed iteration `0001` workstreams for user approval.
2. Complete every required field in `foundation-report.md` and set its status to `complete`.
3. Run the documented format, Clippy, build, test, and example commands from `rust-service/`.
4. Run:

   ```bash
   node .github/skills/rust-service-coordination/scripts/iteration-records.mjs validate-foundation
   ```

5. Commit the validated foundation. Use that commit as iteration `0001`'s `sourceCommit`.

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
5. Run `node .github/skills/rust-service-coordination/scripts/iteration-records.mjs validate NNNN start`.
6. Commit the initialized records as the iteration kickoff, then create the integration branch and isolated worktrees from that kickoff commit using the naming rules in `rust-service/PLAN.md`.
7. Give each agent its generated instruction file and report path.
8. Use write-capable agents for implementation workstreams. Reserve read-only
   exploration agents for audits, review, and status reporting.
9. Dispatch every dependency-independent workstream concurrently. Organize
   dependent work into explicit charter waves, and run the cheapest end-to-end
   prerequisite probe before dispatching a consumer whose primary evidence
   depends on unproven runtime behavior.

Use [iteration charter template](./assets/iteration-charter.template.md) and [workstream instructions template](./assets/workstream-instructions.template.md) for field guidance.

## Worktrees

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
3. Update the workstream report when any of these occurs:
   - a hypothesis is falsified;
   - three materially similar attempts fail;
   - an issue consumes substantial effort relative to the workstream;
   - user intervention or a shared-contract decision is required;
   - an undocumented workaround or cross-workstream dependency appears; or
   - a reusable technique or candidate skill is discovered.
4. For each notable event, capture the attempted approach, evidence, impact, resolution or current state, and reusable lesson. Prefer commands, test names, commits, and artifact links over narrative memory.
5. Create a decision record from [the decision template](./assets/decision-record.template.md) when the outcome changes shared semantics, APIs, crate boundaries, conformance, iteration scope, or coordination policy.
6. Finish with the report template complete and the worktree clean, or enumerate every remaining artifact.

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
2. Record rejected or deferred work, conflict resolution, cross-workstream adaptations, and validation results in `phase-2/integration.md`.
3. Set the manifest status to `phase-2-complete`.
4. Run:

   ```bash
   node .github/skills/rust-service-coordination/scripts/iteration-records.mjs validate NNNN phase-2
   ```

5. Run workspace-level validation and commit the integration boundary only after the artifact check passes.

Workspace-level validation must include the canonical format, strict
workspace/all-target/all-feature Clippy, build, test, and example commands in
`rust-service/DEVELOPMENT.md`. Package-scoped checks do not replace this gate.
When downstream tests consume ignored generated packages or build outputs,
regenerate them in the integration checkout and execute or inspect the exact
consumer artifact rather than relying on a source build or cached output.
Explicitly remove temporary symlinks, copied dependencies, processes, and
command-scoped environment overrides; persistent terminals may not run shell
exit traps when expected.

Use [integration report template](./assets/integration-report.template.md).

## Conduct Phase 3

1. Compare the charter's hypotheses with observed results.
2. Separate implementation defects from shared-abstraction limitations.
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
8. Create instructions for each next-iteration workstream with:

   ```bash
   node .github/skills/rust-service-coordination/scripts/iteration-records.mjs next NNNN workstream-name...
   ```

   Complete the generated instructions and set manifest status to `complete`.
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
