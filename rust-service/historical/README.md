# Historical Records

This folder preserves the Rust service project's research history and retained evidence.
These records describe earlier designs, migration work, experiments, and decisions; they are not the specification of the current implementation.

## Contents

- [Original research plan](PLAN.md) and [foundation report](foundation-report.md).
- Migration and cleanup plans: [Sea migration](SEA_MIGRATION_PLAN.md), [core migration](CORE_MIGRATION_PLAN.md), [API cleanup](SEA_API_CLEANUP_PLAN.md), [monitored streams](MONITORED_STREAM_PLAN.md), [code quality](RUST_CODE_QUALITY_PLAN.md), and [crate cleanup](crateCleanup.md).
- Research notes: [initial notes](notes.md), [service description](notes2.md), and [WebTransport flows](notes4.md).
- [Codespaces transport investigation](CODESPACES_WEBTRANSPORT_PLAN.md): forwarding constraints, streaming and ordinary WebSocket implementation, external browser evidence, and compatibility limitations.
- [Execution isolation investigation](EXECUTION_ISOLATION_INVESTIGATION.md): repeated workstream interference, terminal ownership mechanisms, mocked checks, and remaining upstream validation.
- [Iterations](iterations/): charters, workstream instructions, reports, validation evidence, and retrospectives.
- [Decisions](decisions/README.md): architectural and process decision history.
- [Benchmarks](benchmarks/): saved measurements and profiles, organized by experiment or source revision.

Historical commands, source paths, commit identifiers, and machine metadata record the environment at the time of the work.
They may refer to removed implementations or old worktrees and are not necessarily runnable today.
Preserve the recorded results and conclusions; later work can supersede them without rewriting their history.

## Current Guidance

Start with the [project README](../README.md), [Sea architecture](../SEA_ARCHITECTURE.md), [workspace architecture](../WORKSTREAMS.md), and [crate guides](../crates/README.md).
Use [Development](../DEVELOPMENT.md) for current validation and quality requirements, [Known Issues](../KNOWN_ISSUES.md) for outstanding limitations, and [Learnings](../LEARNINGS.md) for reusable lessons.
The [benchmark specification](../BENCHMARKS.md) and [benchmark scripts](../scripts/README.md) remain outside this folder.

## Continuing the Iteration Process

The [coordination skill](../../.github/skills/rust-service-coordination/SKILL.md) defines the active workflow independently of the original research plan.
New numbered iterations are created directly in `rust-service/historical/iterations/NNNN/` so active and completed research records share one location and numbering sequence.
Active records are updated during work; completed iteration records and accepted decisions remain append-only history.
New decision records belong in `rust-service/historical/decisions/`.

From the repository root, use the existing commands:

```bash
node .github/skills/rust-service-coordination/scripts/iteration-records.mjs init NNNN workstream-name
node .github/skills/rust-service-coordination/scripts/iteration-records.mjs validate NNNN start
node .github/skills/rust-service-status-report/scripts/collect-status.mjs --summary NNNN
```

For a contract and regression-test audit, follow the [quality-iteration skill](../../.github/skills/rust-service-quality-iteration/SKILL.md).
After `init` and before committing the kickoff records, add its inventory with:

```bash
node .github/skills/rust-service-coordination/scripts/iteration-records.mjs init-quality NNNN
```

This command adds the inventory only; it does not replace normal iteration initialization.
At closeout, review the evidence and run `iteration-records.mjs validate-quality NNNN` using the same script path.
No numbered records are required for lightweight work.

The record tool also supports `validate-foundation` for checking the archived foundation report.