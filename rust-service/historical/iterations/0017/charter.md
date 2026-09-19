# Iteration 0017 Charter

Status: active
Source commit: `41e9420cbba665bb4d9ad32f812eb1816a3fdea9`
Coordinator: Parent iteration coordinator; shared ownership and integration authority.

The user approved an incremental quality iteration with three independent workstreams.
Each selects its two highest-risk boundaries and may repair at most one related cluster within its owned paths.
A cluster addresses one material finding and its necessary contract/test changes, not unrelated repairs.
No repair is required when existing evidence is adequate.
Stop or defer after this budget; request approval before expanding it.

## Questions and Hypotheses

| Workstream | Question and falsifiable hypothesis | Cheapest discriminating check |
| --- | --- | --- |
| signals | Does the recently added neutral relay have precise consumer contracts and evidence that isolates its own decisions? Existing evidence may already be sufficient. | Select two risk-ranked relay boundaries; compare each exact promise with the nearest test that would fail if only its owning decision regressed. |
| transport | Do current lifecycle contracts and tests remain sufficient after the recent timeout change, including the reported browser evidence gap? Historical conclusions may not describe the current boundary. | Select two risk-ranked lifecycle boundaries; inspect the current owner and its nearest discriminating test before choosing any platform check. |
| recovery | Do current file and sequencer recovery contracts have local evidence after replacement implementations and reconciled deferrals? Prior acceptance may remain valid or need revision. | Select two risk-ranked recovery boundaries; trace each current contract to its owning decision and cheapest discriminating check. |

The [0016 inventory](../0016/quality-inventory.md) and [deferral reconciliation](../../DEFERRAL_RECONCILIATION.md) are selection hypotheses, not proof of current adequacy or defects.
No expected finding, test location, or required repair is supplied.

## Active Workstreams

Wave 0: The coordinator validates and commits the kickoff, prepares isolated worktrees and task guards, and verifies delegate task access and overlap before audit.
All branches start from that forthcoming kickoff commit, not directly from the source commit above.
Record actual branch, initial HEAD, source relationship, and worktree in each report; never invent the kickoff hash.

| Owner | Writable product scope | Worktree | Branch | Instructions / owned report |
| --- | --- | --- | --- | --- |
| signals delegate | `rust-service/crates/sea-signals/**` | `/workspaces/FluidFramework-rust-service-iteration-0017-signals` | `rust-service-iteration-0017-signals` | [Instructions](phase-2/instructions/signals.md), [report](phase-2/signals.md) |
| transport delegate | `rust-service/crates/sea-webtransport/**`, `rust-service/crates/sea-webtransport-server/**`, `rust-service/tests/webtransport-browser/**`, subject to approval below | `/workspaces/FluidFramework-rust-service-iteration-0017-transport` | `rust-service-iteration-0017-transport` | [Instructions](phase-2/instructions/transport.md), [report](phase-2/transport.md) |
| recovery delegate | `rust-service/crates/sea-file/**`, `rust-service/crates/sea-file-durable/**`, `rust-service/crates/sea-sequencer/**` | `/workspaces/FluidFramework-rust-service-iteration-0017-recovery` | `rust-service-iteration-0017-recovery` | [Instructions](phase-2/instructions/recovery.md), [report](phase-2/recovery.md) |

Wave 1: Audit and bounded repair proceed independently after the access probe succeeds for each delegate.
Each delegate owns only its product scope, its report, and worktree-local ignored validation artifacts.
Return inventory rows through the report; only the coordinator edits the shared inventory.
Shared core, contracts, all manifests and lockfiles, skills, global documentation, and task configuration remain coordinator-owned even when nested under a listed scope.
Minimal WASM or browser-fixture changes require explicit coordinator approval before editing; this is not blanket permission to edit outside transport ownership.
All other paths and worktrees are read-only.

Wave 2: After reports and changes return, integrate accepted work in `/workspaces/FluidFramework-rust-service-iteration-0017` on `rust-service-iteration-0017`.
Reconcile inventory evidence and run canonical gates, then obtain independent review of the integrated state within the same scope and budget, without expected findings.
Phase 3 synthesizes accepted evidence and decisions after integration and independent review.
Leave generated Phase 2 reports, integration, Phase 3, retrospective, skill-review, and next-instruction placeholders for their later phase during this kickoff edit.

## Deferred Scope

Exclude broad rewrites, retention, authentication, production or power-loss qualification, and CI-feed work.
Fluid integration is ongoing in another worktree and is not owned by this iteration; canonical integration tests do not authorize edits there.
Boundaries beyond the initial two per workstream and repair clusters beyond the first require approval or an explicit deferral with remaining risk and a revisit trigger.
Do not start a next iteration or push branches.

## Shared Validation

Follow [DEVELOPMENT.md](../../../DEVELOPMENT.md); the following commands are future execution requirements, not kickoff validation results.
From the integration checkout's `rust-service/` directory:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
RUSTDOCFLAGS='-D warnings' cargo doc --workspace --all-features --no-deps
cargo build --workspace --all-targets
cargo test --workspace --all-targets --all-features
node scripts/check-documentation.mjs
./test.sh
```

Run `pnpm policy-check --path rust-service` from that repository root.
Run root `pnpm build:fast` when Rust changes or other changed inputs affect the registered build graph, including generated WASM, manifests, lockfiles, or task definitions; a package build is not a substitute.
Use fresh worktree-local generated outputs and execute the exact consumer; cached success or ignored outputs from another checkout are insufficient.
Focused tests, conformance, examples, generated consumers, and browser checks must identify the distinct boundary they validate.
Select extra browser modes only when the touched contract needs them.

The coordinator validates records using `.github/skills/rust-service-coordination/scripts/iteration-records.mjs`: `validate 0017 start` before kickoff, `validate 0017 phase-2` at integration, and completion validation plus `validate-quality 0017` after final reconciliation.
For the coordinator's generator/skill check, verify `init 0017 signals transport recovery` precedes `init-quality 0017` in a disposable fixture; do not overwrite these initialized records.
This documentation-only task runs none of those commands; its allowed check is editor diagnostics on the edited files.

### Task Access and Evidence

The loaded task workspace is `/workspaces/FluidFramework`.
Assigned task IDs are `process: rs17-signals-check`, `process: rs17-transport-check`, and `process: rs17-recovery-check`; access probes are `process: rs17-signals-probe`, `process: rs17-transport-probe`, and `process: rs17-recovery-probe`.
The coordinator alone prepares or edits process tasks with absolute cwd, explicit executable/arguments, command-local environment, dedicated panels, and one running instance per task.
The routine runner is `/workspaces/FluidFramework/rust-service/target/iteration-0017-tools/run.mjs`; delegates may not edit it.
Use a worktree-local `CARGO_TARGET_DIR` and worktree-local dependencies; shared runner location does not imply a shared Cargo target.

Before audit, each delegate must demonstrate access to its assigned probe through `run_task` and return attributable evidence.
The coordinator verifies an early overlapping probe using a compound task with `dependsOrder: parallel`, then runs the named compound task `rs17-parallel-checks` for overlapping real checks when ready.
Parallel tool calls do not establish process overlap.
Do not delay immediate post-edit checks to assemble a compound batch.
Test cancellation only with a disposable coordinator-owned probe, never a real check or an unrelated terminal.
Do not claim an upstream terminal fix, autonomous scheduling, or throughput improvement from unmeasured behavior.

Every invocation writes fresh, nonempty `result.json` and `output.log` under its worktree's `rust-service/target/iteration-0017-evidence/<label>-<unique-run-id>/`.
The coordinator defines the runner schema and delegates verify parse success and agreement with the log: unique run ID and label, exact command/arguments and relevant environment, absolute cwd, expected and actual branch/HEAD, status before and after, execution-time guard outcomes, PID, start/end timestamps, output path, completion state, exit code, and test outcomes.
Reject reused directories, missing or stale files, foreign checkout output, mismatched identities, incomplete runs, or contradictory outcomes.
Record a missing value as `unknown` and validation as unverified rather than inferring success or timing.
Retain returned task output too; completed-task output retrieval alone is not durable evidence.

Delegates MUST NOT call `run_in_terminal`, `execution_subagent`, `send_to_terminal`, or `kill_terminal`, including indirect terminal use by Git hooks.
Assigned check tasks may run sequentially within each workstream; no duplicate concurrent task invocation or task-definition edits while running.
Stage/commit operations require explicit coordinator ownership handoff covering hooks, or the coordinator commits returned changes.
No delegate merges, rebases, pushes, or touches another workstream's branch.
If task access fails, stop and ask the coordinator to repair access or run the check; do not switch to terminal tools.

## Contract and Test Evidence

Apply the [quality skill](../../../../.github/skills/rust-service-quality-iteration/SKILL.md) and [coordination skill](../../../../.github/skills/rust-service-coordination/SKILL.md).
Each report ranks two exact boundaries, names owners and consumers, quotes or links the precise contract, and identifies the nearest test that discriminates the owning decision.
Explain why selected boundaries outrank unselected candidates without treating implementation behavior as a promise.
For every changed production crate, supply focused evidence or a concrete rationale for existing or differently owned evidence.
Shared conformance proves laws; integration, generated, and platform checks must prove additional responsibilities.
An `already adequate` result needs a test that fails if only the owning decision regresses, or an explanation of why focused evidence is impractical.
No comment-count, test-count, or coverage-percentage target applies.
No reviewed disposition is assigned in the kickoff inventory.

## Risks and Escalation

Shared semantics or API choices, unclear ownership, cross-workstream dependencies, required manifest/lockfile changes, and minimal WASM/browser-fixture changes require coordinator approval.
Present alternatives and evidence; do not silently choose a new contract to make a test pass.
The coordinator obtains user decisions for material shared choices or scope expansion and owns any required decision record.
Stop at two reviewed boundaries and at most one repair cluster; defer additional discoveries without pursuing them.
Pause after three materially similar failed attempts, substantial unbudgeted effort, missing task access, identity mismatch, foreign output, unexplained exit 130, or ambiguous completion.
Preserve evidence and return control; do not retry through another execution route or cancel an unverified owner.
Move to synthesis with explicit blockers when safe bounded work is exhausted.
