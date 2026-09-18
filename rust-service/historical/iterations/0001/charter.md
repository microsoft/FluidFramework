# Iteration 0001 Charter

Status: active
Source commit: `59f5069b43a6f2ede193f5affa8cda3a267628ff`
Coordinator: interactive user and GitHub Copilot

## Questions and Hypotheses

- **Reference and conformance:** A single reusable suite can distinguish contract behavior from implementation details while supporting concurrent writers, independent finite readers, cancellation by drop, generation-scoped positions, and snapshot recovery. The cheapest check is running the expanded suite against `MemoryStream` and recovering the counter only through public traits.
- **Minimal file store:** A length-framed buffered append file can implement the kernel and reopen after clean shutdown without claiming crash durability. The cheapest check is conformance plus reopen and malformed-tail tests.
- **Durable log:** Opaque ordinal positions and the existing receipt durability vocabulary can describe acknowledgment after a checksummed record reaches stable storage. The cheapest check is a minimal framed log with tail recovery and injected truncation; a minimized failing contract requirement is an acceptable outcome.
- **Compression wrapper:** Per-record compression can be transparent without changing outer positions or append boundaries. The cheapest check is shared conformance and counter recovery through compression over memory, with compressed-size evidence.
- **Fluid sequencer:** Final sequence metadata, writer-local ordering, and reference positions can be framed over the kernel without requiring service-assigned append positions in payloads. The cheapest check is a deterministic multi-writer model; a precise missing primitive is an acceptable outcome.

## Active Workstreams

| Workstream | Owner | Dependencies | Writable paths | Expected evidence and stopping condition |
| --- | --- | --- | --- | --- |
| `reference-conformance` | GitHub Copilot reference agent | Core contract | `crates/memory/`, `crates/conformance/`, `crates/client/`, `examples/counter/`, its report | Expanded public-trait tests and counter path pass; stop on a minimized shared-contract blocker. |
| `file-simple` | GitHub Copilot file agent | Core and conformance | `crates/file-simple/`, its report | Reopen, malformed-data, and applicable conformance evidence; stop before crash-durability mechanisms. |
| `durable-log` | GitHub Copilot durable-log agent | Core and conformance | `crates/spikes/durable-log/`, its report | Checksummed persistence/tail-recovery evidence or a precise contract gap; stop before snapshots or retention if recovery is unresolved. |
| `compression` | GitHub Copilot compression agent | Core, conformance, memory for integration tests | `crates/wrappers/compression/`, its report | Conformance, counter-equivalent recovery, and size evidence; stop if transparent error/position mapping needs shared API changes. |
| `fluid-sequencer` | GitHub Copilot Fluid agent | Core and cited Fluid precedents | `crates/fluid-sequencer/`, its report | Deterministic ordering/reference tests and a clear sufficiency finding or minimized missing primitive. |

The coordinator alone may edit shared manifests, core, decisions, conformance semantics, integration records, or another workstream's paths.

## Deferred Scope

Networking, authenticated encryption, browser storage, caching, retention, complete Fluid drivers, broad native-client conveniences, block compression, and production optimization are deferred. They add policy or composition dimensions not needed to test the first contract across reference behavior, basic persistence, durability, one transforming wrapper, and Fluid sequencing pressure.

## Shared Validation

- `cargo fmt --all -- --check`
- `cargo clippy --workspace --all-targets --all-features -- -D warnings`
- `cargo build --workspace --all-targets`
- `cargo test --workspace --all-targets --all-features`
- `cargo run -p snapshotted-stream-counter`
- `node ../.github/skills/rust-service-coordination/scripts/iteration-records.mjs validate 0001 start`
- Phase 2 integration additionally runs `validate 0001 phase-2`.

## Risks and Escalation

- Any needed change to core semantics, public APIs, conformance meaning, crate boundaries, or shared dependencies is minimized and escalated; work continues only on independent pieces.
- Three materially similar failed approaches, an ambiguous durability claim, or an undocumented workaround ends local experimentation and is recorded.
- Durable-log work stops at a precise requirement if crash recovery cannot be represented without shared changes.
- Fluid work stops at a deterministic counterexample if service-side sequencing or conditional append is irreducible.
- The iteration moves to Phase 3 early when a blocking shared-contract finding prevents two or more workstreams from producing interpretable evidence.
