# Historical Records

This folder records the Sea experiment: what was built, how agents and people developed it, what was measured, and what remained unresolved.
These are dated observations and design records, not current setup instructions, API contracts, or a roadmap.
Source, tests, examples, current guides, and reusable skills remain outside this folder.

## Reading Paths

| Interest | Start here | Supporting records |
| --- | --- | --- |
| Project results | [Project overview](PROJECT_OVERVIEW.md), measured September 2026 | [Measurement evidence](measurements/README.md) |
| Agentic development | [Method, outcomes, and limits](AGENTIC_DEVELOPMENT.md) | [Learnings](LEARNINGS.md), [iterations](iterations/), and [decisions](decisions/README.md) |
| Design evolution | [Sea migration](SEA_MIGRATION_PLAN.md) and [core migration](CORE_MIGRATION_PLAN.md) | [Blob-tree design](BLOB_STORAGE.md), [client integration](SERVICE_CLIENT_PLAN.md), and [Fluid test integration](INTEGRATION_TEST_CONFIGURATION_PLAN.md) |

The overview preserves the measured revisions, comparison limits, unsuccessful outcomes, and unverified claims.
Iteration reports preserve the reasoning, repairs, no-change results, and human interventions needed to assess the development approach.
An issue described as open or a stage described as pending in an old report is not necessarily open today; consult [current known issues](../KNOWN_ISSUES.md) and the owning code and tests.

## Contents

- [Original research plan](PLAN.md) and [foundation report](foundation-report.md).
- Migration and cleanup plans: [Sea migration](SEA_MIGRATION_PLAN.md), [core migration](CORE_MIGRATION_PLAN.md), [API cleanup](SEA_API_CLEANUP_PLAN.md), [monitored streams](MONITORED_STREAM_PLAN.md), [code quality](RUST_CODE_QUALITY_PLAN.md), and [crate cleanup](crateCleanup.md).
- Research notes: [initial notes](notes.md), [service description](notes2.md), and [WebTransport flows](notes4.md).
- [Codespaces transport investigation](CODESPACES_WEBTRANSPORT_PLAN.md): forwarding constraints, streaming and ordinary WebSocket implementation, external browser evidence, and compatibility limitations.
- [Execution isolation investigation](EXECUTION_ISOLATION_INVESTIGATION.md): repeated workstream interference, terminal ownership mechanisms, mocked checks, and remaining upstream validation.
- [Historical deferral reconciliation](DEFERRAL_RECONCILIATION.md): current dispositions and remaining gaps for the six product deferrals retained by iteration 0016.
- [Iterations](iterations/): charters, workstream instructions, reports, validation evidence, and retrospectives.
- [Decisions](decisions/README.md): architectural and process decision history.
- [Original benchmark specification](BENCHMARKS.md) and [storage optimization investigation](STORAGE_OPTIMIZATION.md): experiment procedures and observations at their recorded revisions.

Historical commands, source paths, commit identifiers, and machine metadata record the environment at the time of the work.
They may refer to removed implementations or old worktrees and are not necessarily runnable today.
Preserve the recorded results and conclusions; later work can supersede them without rewriting their history.
Links to superseded benchmark artifacts use a pinned Git revision rather than files in the current checkout.

## Current Guidance

Start with the [project README](../README.md), [Sea architecture](../SEA_ARCHITECTURE.md), [workspace architecture](../WORKSPACE_ARCHITECTURE.md), and [crate guides](../crates/README.md).
Use [Development](../DEVELOPMENT.md) for current validation and quality requirements and [Known Issues](../KNOWN_ISSUES.md) for outstanding limitations.
Use the [benchmark harness](../crates/sea-benchmarks/README.md) and [collection scripts](../scripts/README.md) for current measurement commands.
The [learning index](LEARNINGS.md) explains the observations behind practices; applicable requirements belong in current guides, contracts, and skills.

## Continuing the Iteration Process

The [coordination skill](../../.github/skills/rust-service-coordination/SKILL.md) defines the active workflow independently of the original research plan.
See [iteration records](iterations/README.md) for layout and initialization, and [decision records](decisions/README.md) for decision triggers.
Completed iterations and accepted decisions remain append-only; lightweight work needs no numbered records.
Contract/regression audits additionally follow the [quality-iteration skill](../../.github/skills/rust-service-quality-iteration/SKILL.md).
Current-state simplification and consolidation audits additionally follow the [simplification-iteration skill](../../.github/skills/rust-service-simplification-iteration/SKILL.md).