# Iteration 0014 Charter

Status: active
Source commit: `e06794556ebb92d2d33b83577f903e201fd78b2a`
Coordinator: GitHub Copilot

## Questions and Hypotheses

- **Relied-upon contracts:** Consequential behavior may be implemented correctly
	while its owning contract is absent, inaccurate, or less specific than its
	consumers require. The hypothesis is that risk-ranked boundary inspection can
	find material contract gaps without enumerating declarations. The cheapest
	check is to select each crate's highest-risk responsibility boundary, identify
	a real consumer, and compare that consumer's assumptions with the owning
	documentation and implementation.
- **Localized regression evidence:** Some behavior may be covered only through a
	broad conformance, integration, generated-binding, or platform test even when
	focused owning-crate coverage is practical. The hypothesis is that tracing the
	distinct responsibility of each existing test layer will expose material gaps
	or redundancy. The cheapest check is to map one high-risk behavior to its
	focused and broader tests and determine which implementation decision each
	failure would diagnose.
- **Proportionate repair:** Confirmed gaps can be improved without changing
	shared semantics or producing test and documentation volume for its own sake.
	The hypothesis is that one narrow contract/test repair or a validated
	no-change conclusion can resolve each selected boundary. The cheapest check is
	a focused test or contract comparison that can falsify the proposed gap before
	implementation.
- **Convergence after prior audit:** Iteration `0013` performed a crate-wide
	documentation, code, and test audit, so some crates may already have
	proportionate evidence. The hypothesis is that using its reports plus current
	risk evidence will avoid repeating adequate work while still identifying
	material blind spots. The cheapest check is to compare each selected boundary
	with the applicable `0013` report before proposing a change.

## Active Workstreams

All 14 crate workstreams are Wave 1 and may run concurrently from the same
kickoff commit. Each is owned by a write-capable GitHub Copilot subagent, has no
implementation dependency on another workstream, and may write only its package
root and generated report. Read-only inspection of consumers, dependencies,
iteration `0013` evidence, and workspace documentation is allowed.

Each workstream ranks consequential boundaries in its crate, deeply inspects the
highest-risk candidates, and retains at most two unrelated repair clusters.
After each accepted repair it reranks the remaining candidates. It stops when
the next candidate lacks a material gap, requires a shared decision or path
outside ownership, or would add maintenance cost disproportionate to its risk.
It records reviewed no-change boundaries and deferred candidates rather than
manufacturing a commit.

| Workstream | Writable package | Primary risk emphasis | Expected evidence |
| --- | --- | --- | --- |
| `sea-benchmarks` | `crates/sea-benchmarks/` | workload semantics, measurement boundaries, failure reporting | reviewed boundaries, focused checks, report |
| `sea-conformance` | `crates/sea-conformance/` | implementation-independent laws, diagnostic assertions, overlap with implementation tests | reviewed boundaries, focused checks, report |
| `sea-content-addressed` | `crates/sea-content-addressed/` | digest invariants, authorization assumptions, graph traversal | reviewed boundaries, focused checks, report |
| `sea-core` | `crates/sea-core/` | shared traits, monitored streams, error and value contracts | reviewed boundaries, focused checks, report |
| `sea-file` | `crates/sea-file/` | file lifecycle, partial I/O, recovery and cancellation | reviewed boundaries, focused checks, report |
| `sea-sequencer` | `crates/sea-sequencer/` | ordering, recovery, sessions, progress, snapshot state | reviewed boundaries, focused checks, report |
| `sea-memory` | `crates/sea-memory/` | storage laws, range boundaries, atomicity | reviewed boundaries, focused checks, report |
| `sea-file-durable` | `crates/sea-file-durable/` | durability claims, crash recovery, corruption and partial writes | reviewed boundaries, focused checks, report |
| `sea-compression` | `crates/sea-compression/` | transformation boundaries, limits, malformed input | reviewed boundaries, focused checks, report |
| `sea-encryption` | `crates/sea-encryption/` | authentication, nonce and key assumptions, malformed input | reviewed boundaries, focused checks, report |
| `sea-stateful-compression` | `crates/sea-stateful-compression/` | state transitions, replay, reset and error propagation | reviewed boundaries, focused checks, report |
| `sea-webtransport` | `crates/sea-webtransport/` | protocol, correlation, client stream lifecycle, native/WASM parity | reviewed boundaries, focused checks, report |
| `sea-webtransport-server` | `crates/sea-webtransport-server/` | connection/stream lifecycle, dispatch, liveness, shutdown | reviewed boundaries, focused checks, report |
| `sea-counter` | `examples/sea-counter/` | example assumptions, error handling, executable contract | reviewed boundaries, focused checks, report |

## Deferred Scope

Non-Rust packages, generated artifacts, performance optimization, dependency or
manifest changes, wire and persistence format redesign, public cross-crate API
changes, and architecture changes are deferred. A workstream may document a
material finding in those areas but must not implement it without coordinator
review and, where required, a Phase 3 decision. Exhaustive declaration comments,
coverage targets, trivial helper tests, and repetition of already adequate
iteration `0013` work are explicitly outside scope because they do not establish
behavioral quality.

## Shared Validation

- Each workstream guards checkout identity and runs `cargo fmt --all -- --check`,
	strict package-scoped Clippy, warning-denied package rustdoc, package tests with
	all applicable targets and features, `git diff --check`, and scope/lockfile
	checks. It runs commands documented by any README it changes.
- Workstreams use a focused test or check immediately after each behavior or
	documentation repair. Native and WASM target checks both apply to
	`sea-webtransport` when touched behavior is shared.
- Phase 2 integration runs every canonical command in `rust-service/DEVELOPMENT.md`,
	including `./test.sh`, plus `pnpm policy-check --path rust-service` from the
	repository root. It runs repository-root `pnpm build:fast` when accepted Rust
	sources or manifests affect registered generated-WASM inputs.
- Phase 3 runs both iteration-record validation and
	`quality-inventory.mjs validate 0014`. The inventory is the retained
	machine-readable-in-spirit Markdown evidence; it must contain one reconciled
	row per consequential reviewed boundary, no placeholders, direct report/test
	references, dispositions, and revisit triggers for unresolved items.

## Contract and Test Evidence

Workstreams follow `rust-service/DEVELOPMENT.md` and the
`rust-service-quality-iteration` skill. For each selected boundary they identify
the owning component and actual consumers, state only the behavior those
consumers need, compare it with the documented contract, and map existing tests
by responsibility. A confirmed repair documents the needed promise and adds or
improves the smallest deterministic owning-module or owning-crate test that
would diagnose the behavior.

Shared conformance coverage is retained or added only for implementation-
independent laws. Integration, generated-binding, and browser tests are retained
or added only for distinct composition or platform evidence. Each changed
production crate reports its focused evidence or identifies sufficient existing
evidence or another owning boundary. No workstream is scored by comment count,
test count, coverage percentage, or whether it creates a commit.

## Risks and Escalation

- Broad auditing can create low-value churn. Stop when the next candidate lacks a
	material consumer-visible or maintenance risk, and record adequate evidence as
	a no-change result.
- Documentation can over-promise. Stop and escalate when consumers appear to
	need a new shared semantic guarantee rather than clarification of implemented
	behavior.
- A focused test may expose a production defect. A small crate-local fix is
	allowed when the intended contract is already clear; otherwise retain the
	reproducer when practical and escalate the semantic decision.
- Cross-crate findings can create overlapping edits. Workstreams do not modify
	read-only dependencies; the integrator reconciles contract proposals or sends
	shared questions to Phase 3.
- Persistence, wire-format, security, dependency, public API, and architecture
	changes stop the workstream unless the coordinator explicitly re-scopes it.
- Move to Phase 3 early if the audit method repeatedly selects low-value work, if
	ownership prevents material repairs, or if three workstreams reveal the same
	systematic guidance defect.
