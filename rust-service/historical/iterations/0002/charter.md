# Iteration 0002 Charter

Status: active
Source commit: `57b0028ff9061087b522c8dd652ca9b8b2179e50`
Coordinator: interactive user and GitHub Copilot

## Questions and Hypotheses

- **Reference model and faults:** A deterministic sequential model plus injectable outcomes can express ordering, finite-read, generation, snapshot, codec, and ambiguous-response laws without implementation-private hooks. The cheapest disproof is a generated trace or codec case that requires hidden state or a semantic change.
- **Durable snapshots:** Duplicated framing evidence plus atomically published, synced snapshot records can distinguish incomplete tails from corruption and keep every acknowledged snapshot recoverable. The cheapest disproof is a deterministic crash point that accepts corruption or makes an acknowledged snapshot unusable.
- **Network transport:** A bounded framed request/response protocol can expose the raw traits and `PositionCodec` without unbounded buffering or implied live subscription. The cheapest disproof is a slow-reader/disconnect/reconnect test that loses, duplicates, or exceeds the configured queue bound.
- **Authoritative sequencer:** One fenced sequencer plus submission identity and replay can reject invalid Fluid operations before storage and resolve ambiguous outcomes without conditional append. The cheapest disproof is a fencing-loss or ambiguous trace that creates two accepted successors, loses acceptance, or requires unsafe duplicate append.

## Active Workstreams

| Workstream | Owner | Dependencies | Writable paths | Expected evidence and stopping condition |
| --- | --- | --- | --- | --- |
| `reference-model-faults` | GitHub Copilot reference/model agent | Integrated core, memory, and conformance | `crates/conformance/`, `crates/memory/`, its report | Deterministic model/fault traces and codec conformance; stop on implementation-private access or semantic change. |
| `durable-snapshots` | GitHub Copilot durable recovery agent | Durable spike; consume reference additions when ready | `crates/spikes/durable-log/`, its report | Crash-point, framing, snapshot lineage/publication/recovery evidence; stop before retention or undocumented repair. |
| `network-transport` | GitHub Copilot network transport agent | Network boundary, `PositionCodec`; consume reference additions when ready | `crates/wrappers/network/`, its report | Bounded transport, reconnect, codec, snapshot, and composition evidence; stop on a minimized contract gap. |
| `authoritative-sequencer` | GitHub Copilot authoritative Fluid sequencer agent | Fluid spike and Decision 0004 | `crates/fluid-sequencer/`, its report | Valid-only storage, reconnect/regeneration, fencing, and ambiguous recovery evidence; stop on an irreducible conditional-append requirement. |

All four workstreams may begin concurrently from the kickoff. Reference conformance additions are a later validation dependency for durable and network, not an implementation blocker.

## Deferred Scope

Encryption, browser storage, caching, retention, block compression, full Fluid drivers, and broad optimization remain deferred. They do not answer the prioritized crash-snapshot, transport, or authoritative-sequencing questions more cheaply. File-simple and compression remain integrated fixtures rather than independent workstreams.

## Shared Validation

- `cargo fmt --all -- --check`
- `cargo clippy --workspace --all-targets --all-features -- -D warnings`
- `cargo build --workspace --all-targets`
- `cargo test --workspace --all-targets --all-features`
- `cargo run -p snapshotted-stream-counter`
- `node ../.github/skills/rust-service-coordination/scripts/iteration-records.mjs validate 0002 start`
- Phase 2 integration additionally runs `validate 0002 phase-2`; Phase 3 runs `validate 0002 complete`.

## Risks and Escalation

- Shared trait, semantic, conformance, workspace, and decision changes require coordinator ownership and a minimized failing case.
- A crash-recovery path stops before claiming guarantees unsupported by deterministic fault evidence.
- Network work stops rather than inventing live-tail or unbounded buffering semantics.
- Authoritative sequencing stops and escalates if fencing cannot prevent two accepted successors or ambiguity cannot be resolved without a new kernel primitive.
- Three materially similar failed approaches, an ownership violation, or a blocker affecting two workstreams moves the iteration to Phase 3 early.
- Delegated validation must identify its checkout and preserve shared lockfiles outside ownership.
