# Iteration 0020 Charter

Status: complete
Source commit: `8a3889518d537d6a85bd55cc31a1b7404eee78e7`
Coordinator: Copilot SDK assistant.

The user approved incremental review across all 15 Rust workspace members, with full coverage of changed consequential boundaries and unresolved findings whose revisit triggers apply.
The change window begins at quality iteration 0018 closeout `8bd1e64ebfa`.
Inherited evidence: [0018 inventory](../0018/quality-inventory.md), [0019 simplification](../0019/manifest.json), [sequential audit](../../QUALITY_AUDIT_REPORT.md), and [known issues](../../../KNOWN_ISSUES.md).
Previously accepted conclusions are rechecked where subsequent changes or recorded triggers warrant it; unchanged, unaffected contracts do not require a full reassessment.
Estimated effort is 20-30 boundaries and several hours plus validation, not a coverage or time cutoff.
Repair all confirmed localized gaps; escalate redesigns and ambiguous shared semantics.
The user authorized parallel execution, local commits without pushing, canonical validation, and fresh independent review.

## Questions and Hypotheses

Do changed contracts, implementations, and focused tests still agree at their owning boundaries?
For each assigned area, test the hypothesis that a consequential owning decision can regress without failing the nearest test.
Inspect exact contracts and assertions first; use focused deterministic execution or a bounded mutation when needed.
Storage pressure, reader shedding, author admission, and typed hosting lead the review because recent changes affect cancellation, resource lifetime, and publication authority.

## Active Workstreams

Wave 1 has four independent ownership groups, all starting from the same kickoff.
Paths below are relative to `rust-service/`; each worker also owns only its own Phase 2 report.

| Workstream | Crates and writable paths | Consequential review areas |
| --- | --- | --- |
| foundations | `crates/sea-core/`, `crates/sea-file/`, `crates/sea-memory/`, `crates/sea-content-addressed/`, `crates/sea-conformance/` | Policy/factory contracts and decorators, durable pressure and recovery, storage publication, capability forwarding, shared laws |
| sessions | `crates/sea-sequencer/`, `crates/sea-signals/`, `crates/sea-compression/`, `crates/sea-encryption/` | Admission and cancellation, publication/recovery, cache pressure and reclamation, session/transform composition and signal lifecycle |
| transport | `crates/sea-webtransport/`, `crates/sea-webtransport-server/` | Typed hosting and protocol adaptation, pipelined author receipts, limits/defaults, connection scheduling, timeouts and stream lifecycle |
| consumers | `crates/sea-wasm/`, `crates/sea-benchmarks/`, `crates/sea-integration-tests/`, `examples/sea-counter/` | Binding ownership, composition, measurement correctness and executable consumer contracts |

Every group accounts for every assigned member and changed consequential boundary, including no-change results.
Inspect direct dependencies read-only; request cross-owner repairs through the coordinator.
The coordinator owns root documentation, shared manifests/lockfiles, iteration inventory, integration, validation scheduling, and any changeset.
Wave 2 is a fresh read-only independent review of frozen integrated repairs and dispositions, followed by bounded repairs/rechecks where necessary.
No worker may merge, rebase, push, alter another workstream, or change shared semantics without approval.

## Deferred Scope

New features, broad redesigns, benchmark campaigns, infrastructure provisioning, production hardening, and physical power-loss qualification are excluded.
Known limitations without an applicable incremental revisit trigger remain recorded, not silently closed.
Review cannot stop merely because a repair is deferred.

## Shared Validation

Apply [canonical checks](../../../DEVELOPMENT.md#canonical-rust-checks) to the actual changed surfaces.
For implementation/test changes, run affected complete crate tests and directly affected dependent checks, then final workspace formatting, strict Clippy/rustdoc, native build, documentation checker, policy validation, and `./test.sh` or `./test.sh --extended` as required.
Lifecycle, protocol, or recovery changes require the extended gate.
No benchmark performance campaign is authorized.
Workers use registered guarded process tasks if invocation works; otherwise parallel file audit/edit batches pause for coordinator-owned validation.
Only the coordinator owns foreground shell execution unless explicitly transferred.
Task logs must contain a fresh identifier, cwd/branch/HEAD/status, exact commands, outcomes, and exit status.
Any retained JSON evidence must parse, be nonempty, and agree with the named source and tests.
No simultaneous writers to one Cargo target or generated output.

## Contract and Test Evidence

Reports link exact owning promises, decisions, and discriminating test names for every disposition.
Use the quality skill and development guide rather than repeating their method here.
No-change claims must distinguish focused local diagnosis from conformance and broader consumer evidence.
Inventory rows link each worker's validation and cover every assigned crate's incremental relevance.

## Risks and Escalation

Stop when full incremental coverage, accepted localized repairs, applicable gates, and independent review are complete.
Ask before reducing coverage, changing semantics, or expanding exclusions.
Preserve original failures and distinguish environment/tooling blockers from product failures.
Do not infer physical durability, production authentication, or sustainable memory use from unit tests.
Any unexpected source changes or mismatched checkout identity block acceptance until reconciled.
