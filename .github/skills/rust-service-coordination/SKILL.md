---
name: rust-service-coordination
description: 'Coordinate the Rust service Phase 1 foundation and Phase 2 or Phase 3 iterations, including implementation, validation, workstreams, worktrees, integration, reports, retrospectives, decision records, learning logs, skill reviews, and next-iteration instructions. Use when starting, implementing, validating, integrating, recovering, or closing the rust-service foundation or an iteration, or when recording costly issues and agentic-development lessons.'
argument-hint: 'run or validate the foundation, iteration, integration, or review workflow'
---

# Rust Service Coordination

Use this workflow for every numbered iteration under `rust-service/iterations/`.

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

1. Confirm the foundation or previous Phase 3 commit passes its documented checks.
2. Select active workstreams and pre-register their hypotheses, dependencies, expected evidence, and stopping conditions.
3. Run:

   ```bash
   node .github/skills/rust-service-coordination/scripts/iteration-records.mjs init NNNN workstream-name...
   ```

4. Set `sourceCommit` to the approved foundation or previous Phase 3 commit, complete `charter.md` and each generated instruction, and set manifest status to `active`.
5. Run `node .github/skills/rust-service-coordination/scripts/iteration-records.mjs validate NNNN start`.
6. Commit the initialized records as the iteration kickoff, then create the integration branch and isolated worktrees from that kickoff commit using the naming rules in `rust-service/PLAN.md`.
7. Give each agent its generated instruction file and report path.

Use [iteration charter template](./assets/iteration-charter.template.md) and [workstream instructions template](./assets/workstream-instructions.template.md) for field guidance.

## Worktrees

Create the integration branch and worktree from the kickoff commit, then create every workstream from that same commit:

```bash
git branch rust-service/iteration-NNNN <kickoff-commit>
git worktree add ../FluidFramework-rust-service-iteration-NNNN rust-service/iteration-NNNN
git worktree add -b rust-service/iteration-NNNN/<workstream> ../FluidFramework-rust-service-iteration-NNNN-<workstream> <kickoff-commit>
```

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

Use [integration report template](./assets/integration-report.template.md).

## Conduct Phase 3

1. Compare the charter's hypotheses with observed results.
2. Separate implementation defects from shared-abstraction limitations.
3. Review every costly issue, human intervention, workaround, and proposed decision.
4. Create or update decision records and link them from the Phase 3 report.
5. Decide interactively which workstreams to keep, remove, replace, or add next.
6. Complete the retrospective and promote durable lessons to `rust-service/LEARNINGS.md`.
7. Review candidate skills and coordination friction. Record accepted, rejected, and deferred skill changes in `skill-review.md`; update this skill only for approved changes supported by evidence.
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

## Validation

The validator checks required files, manifest/report correspondence, required section headings, unresolved template markers, and decision links. It does not prove that claims are accurate; reviewers must compare reports with commits and command output.
