# Iteration 0018 Charter

Status: active
Source commit: `73aae4414baff2e635f6ccdcbd2b4cb507d62bfd`
Coordinator: Copilot session `4cc33478-17d9-40d5-9640-a53d9778b2c5`.

The user approved a full reassessment of all 15 Rust workspace members, including unchanged and previously accepted boundaries.
The explicit reassessment request is the revisit trigger.
Coverage has no boundary-count or time cutoff; the configuration estimate was 30-45 consequential boundaries and several hours plus validation, not a coverage limit.
Repair every confirmed localized contract/test gap and unambiguous localized behavior bug.
Ask before redesigns or unresolved semantic choices, but continue independent review.
Execution is an explicitly authorized parallel iteration with local commits and independent Phase 3 evidence review; no push is authorized.
Inherited evidence: [prior sequential audit](../../QUALITY_AUDIT_REPORT.md), [0017 inventory](../0017/quality-inventory.md), and [deferral reconciliation](../../DEFERRAL_RECONCILIATION.md).
Historical acceptance is a hypothesis, not a reason to skip current inspection.

## Questions and Hypotheses

Does each consequential responsibility have an accurate consumer-facing contract and discriminating evidence at its narrowest practical owner?
Candidate hypotheses are missing/inaccurate promises, absent owner-local regression guards, misplaced broad-only evidence, and adequate existing coverage.
Map current contracts to owning decisions and exact tests before deciding whether changes are needed.
Risk orders inspection: persistence/recovery and lifecycle first, followed by state transitions, transformations, parsing/limits, generated boundaries, and tooling consumers.
Recent changes and known deferrals inform ranking, not eligibility.

## Active Workstreams

Wave 1 is dependency-independent inspection and localized repair from one kickoff commit.
Each owner may change only the listed paths and its own report.
Shared manifests, lockfiles, core semantic changes affecting consumers, global records, and changesets require coordinator approval.

| Owner | Workspace members and writable implementation paths | Consequential responsibility map |
| --- | --- | --- |
| foundations | `crates/sea-core`, `crates/sea-memory`, `crates/sea-content-addressed`, `crates/sea-conformance` | Storage/session promises, publication dependencies, identities, read/progress/invalidation, memory ownership, content trees, shared laws |
| persistence | `crates/sea-file` | Buffered/durable persistence, journal/tail recovery, checkpoints, worker cancellation, invalidation, namespace and locking |
| sessions | `crates/sea-sequencer`, `crates/sea-signals`, `crates/sea-compression`, `crates/sea-encryption` | Ordering/reconciliation, membership/election, cache/cursors, routing/overflow, transform composition and malformed data |
| transport | `crates/sea-webtransport`, `crates/sea-webtransport-server` | Protocol/framing, correlations, stream lifecycle/backpressure, native/browser/WebSocket transport, server admission/runtime cleanup |
| consumers | `crates/sea-wasm`, `crates/sea-integration-tests`, `crates/sea-benchmarks`, `examples/sea-counter` | Binding conversion/lifetimes, cross-crate composition, measurement validity, example replay; consumer fixtures in `tests` and `scripts` only when directly needed |

Paths are relative to `rust-service/`.
Transport may propose browser fixture changes to the consumers owner; only consumers writes shared test harnesses.
Each report must refine this map to account for all consequential areas of every assigned crate, including no-change findings and reviewed exclusions.
Stop only after complete assigned inspection and validated localized repairs, or disclose a blocker.
Wave 2 integrates all five workstreams and executes canonical/fresh generated-consumer checks.
Wave 3 independently reviews the integrated evidence and coverage against the approved scope, without expected findings.

## Deferred Scope

Broad redesigns, infrastructure provisioning, benchmark campaigns, and production/power-loss qualification are excluded.
No workspace member is excluded and no review-count cutoff is imposed.
TypeScript packages are consumers and distinct-boundary evidence, not a separate full-package audit.

## Shared Validation

Run `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets --all-features -- -D warnings`, `RUSTDOCFLAGS='-D warnings' cargo doc --workspace --all-features --no-deps`, `cargo build --workspace --all-targets`, `cargo test --workspace --all-targets --all-features`, and `node scripts/check-documentation.mjs` from `rust-service/`.
Run `pnpm policy-check --path rust-service` and, for declared package inputs, `pnpm build:fast` from the repository root.
Run `rust-service/test.sh` for complete integration and browser evidence, with fresh generated consumers in the integration checkout.
Validate iteration records at kickoff, Phase 2, and completion, and the final quality inventory.
Machine-readable execution evidence, if retained, must parse, be nonempty, identify run/cwd/branch/HEAD/command/exit, and correspond to actual checks; benchmark data is not requested.
Use process tasks where available; only the coordinator owns foreground shell execution.
Delegates must prove assigned task discovery/invocation before autonomous command loops.

## Contract and Test Evidence

Follow [Development](../../../DEVELOPMENT.md) and the quality skill.
Every disposition names a precise contract, owning decision, and discriminating test or practical limitation.
Reports supply inventory rows; the coordinator reconciles them.
No-change outcomes are valid; test/comment counts are not acceptance criteria.

## Risks and Escalation

Preserve failures, ambiguous execution, ownership conflicts, and blocked checks rather than claiming success from retries.
Escalate unresolved shared semantics, substantial redesigns, or incomplete full-scope review.
No next iteration is approved; closeout requires all 15 members accounted for, applicable gates, and independent evidence review.
