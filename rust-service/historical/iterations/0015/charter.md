# Iteration 0015 Charter

Status: active
Source commit: `ff7d736642c2711b44ce0507b2319c188ff46129`
Coordinator: GitHub Copilot

## Questions and Hypotheses

- **Owning-decision evidence:** Some iteration `0014` `already adequate`
	dispositions may cite tests about the same topic without isolating the exact
	implementation decision. The hypothesis is that independently challenging
	each inherited disposition will find any material masked gaps. The cheapest
	check names the decision and nearest test, then asks whether another component
	can satisfy that test while the decision is broken.
- **Convergence:** Most inherited dispositions may already meet the stricter
	standard. The hypothesis is that five broader ownership groups can verify the
	complete inventory with little additional churn. A no-change result supported
	by exact decision/test mappings is positive evidence.
- **Proportionate repair:** Any confirmed gap can be repaired with a concise
	contract clarification and the narrowest practical deterministic test. The
	cheapest check is to establish that the proposed test fails when only the
	owning decision regresses before expanding scope.

## Active Workstreams

All five workstreams are Wave 1 and run concurrently from one kickoff commit.
Each uses the matching approved instructions retained by iteration `0014`, may
write only its listed crates and report, and has no implementation dependency on
another workstream.

| Workstream | Writable scope | Expected evidence | Stopping condition |
| --- | --- | --- | --- |
| `core-session` | `sea-core`, `sea-conformance`, `sea-sequencer` | Every inherited row challenged; exact decision/test mapping; at most two repair clusters | All rows discriminate, two clusters, or shared semantic decision required |
| `storage` | `sea-content-addressed`, `sea-memory`, `sea-file`, `sea-file-durable` | Every inherited row challenged; exact backend decision/test mapping; at most two repair clusters | All rows discriminate, two clusters, or format/durability decision required |
| `decorators` | `sea-compression`, `sea-encryption`, `sea-stateful-compression` | Every inherited row challenged; exact wrapper decision/test mapping; at most two repair clusters | All rows discriminate, two clusters, or format/security decision required |
| `transport` | `sea-webtransport`, `sea-webtransport-server`, generated Node tests | Every inherited row challenged; exact transport decision/test mapping; at most two repair clusters | All rows discriminate, two clusters, or platform/wire decision required |
| `workloads` | `sea-benchmarks`, `sea-counter` | Every inherited row challenged; exact oracle/behavior test mapping; at most two repair clusters | All rows discriminate, two clusters, or workload semantics would change |

## Deferred Scope

New workspace areas, non-Rust packages, generated artifacts, browser-only fixture
design, stalled-handshake fixtures, power-loss qualification, persistence or
wire-format changes, dependency changes, and shared API redesign are deferred.
Existing deferred findings stay deferred unless this run discovers new
deterministic evidence within owned paths. The run verifies inherited evidence;
it does not restart a broad declaration or coverage audit.

## Shared Validation

- Workstreams run focused checks immediately after edits, then package-scoped
	format, strict Clippy, warning-denied rustdoc, all-target/all-feature tests,
	`git diff --check`, lockfile checks, and ownership guards.
- Transport runs the WASM target check and generated Node suite when applicable;
	workloads run benchmark smoke and `sea-counter`; storage removes temporary
	roots and transport stops owned endpoints.
- Integration runs every canonical command in `rust-service/DEVELOPMENT.md`,
	`./test.sh`, `pnpm policy-check --path rust-service`, and `pnpm build:fast` when
	changed inputs require it.
- Phase 3 validates iteration records and `quality-inventory.md`. Inventory rows
	must cover every inherited `0014` row, name exact owning decisions and nearest
	discriminating tests, and preserve unresolved revisit triggers.

## Contract and Test Evidence

Follow `rust-service/DEVELOPMENT.md`, the quality-iteration skill, and the
strengthened coordination templates. An `already adequate` result is accepted
only when it names the exact owning decision and the nearest test that fails if
only that decision regresses, or explains why the narrowest practical evidence
must cross a broader boundary. Topical coverage that another component can
satisfy is insufficient. Conformance, integration, generated, and platform tests
count only for their distinct responsibilities. No workstream is scored by
change, comment, test, or coverage volume.

## Risks and Escalation

- Verification can become a mechanical inventory exercise. Inspect actual code,
	consumers, and test assertions; stop when direct evidence settles a row.
- A proposed focused test can accidentally encode incidental behavior. Escalate
	when consumer needs do not establish the promise.
- Cross-scope repairs can overlap. Record them for integration instead of editing
	another workstream's paths.
- Stop at two unrelated repair clusters, shared semantics, formats, dependencies,
	or unavailable platform/fault evidence.
- Move to Phase 3 early if all workstreams validate inherited dispositions with
	no material gaps or expose the same remaining process limitation.
