# Iteration 0006 Charter

Status: active
Source commit: `3a72dfe57b8f3b9ee96befd18c85616440fea8e7`
Coordinator: GitHub Copilot primary agent with interactive user approval

## Questions and Hypotheses

1. **Native connection concurrency:** Can the native WebTransport server accept two certificate-pinned sessions concurrently while preserving the fence through authoritative replay, validation, append, and shutdown? Disprove first by holding browser client 1 open while client 2 handshakes and both independently submit, read projected operations, reconnect, and resolve ambiguity without duplication.
2. **Direct SharedTree integration:** After concurrency is accepted, is the minimal driver surface sufficient for two real SharedTree clients to create/load one document, converge edits, summarize/reload, reconnect, and recover without FSQ2 decoding or hidden retry? Disprove first with one minimal schema and one edit per independently connected browser client.

## Active Workstreams

- **Wave 1, native-connection-concurrency:** owns the native WebTransport wrapper, focused native/browser transport harnesses, and its report. It must publish deterministic native lifecycle evidence plus a genuine two-session Chromium trace. It stops if concurrency requires weakening fencing, kernel changes, hidden retry, or broader deployment claims.
- **Wave 2, direct-shared-tree-integration:** may inspect interfaces and prepare a disjoint fixture during Wave 1 but depends on the accepted concurrency handoff before implementation or browser claims. It owns a focused SharedTree package/harness, narrow minimal-driver additions, and its report. It stops if real SharedTree requires private FSQ2 decoding, incompatible protocol semantics, hidden retry, retention guarantees, or broad production-driver implementation.

Both worktrees start from the same kickoff commit. The coordinator cherry-picks the accepted Wave 1 handoff into Wave 2 without rebasing. Integration owns root workspace registration, shared lockfiles, cross-workstream conflict resolution, and final validation.

## Deferred Scope

Retention and garbage collection, browser storage, distributed fencing, hardware power-loss qualification, cloud blob storage, authentication and authorization, Node WebTransport, production package publication, Routerlicious/ODSP compatibility, offline merge, fallback transports, and broad optimization remain deferred. They are not required to answer the two approved single-host browser-consumer questions.

## Shared Validation

From `rust-service/`, integration runs:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo build --workspace --all-targets
cargo test --workspace --all-targets --all-features
cargo run -p snapshotted-stream-counter
node ../.github/skills/rust-service-coordination/scripts/iteration-records.mjs validate 0006 phase-2
```

Transport work additionally runs focused native tests, host and `wasm32-unknown-unknown` strict Clippy, fresh binding generation, the existing single-session traces, and a new two-session Chromium trace without insecure flags. SharedTree work runs repository-standard format, lint, typecheck, build, and tests for its focused package plus actual-WASM Node tests and the two-session Chromium application. Every Cargo command uses a checkout-specific target; generated artifacts must be directly inspected or executed.

## Risks and Escalation

- Concurrency must move connection handling outside the serial accept loop without making the non-`Send` fence guard transferable or shortening its replay/validation/append scope.
- Per-connection tasks need bounded ownership, cancellation, error propagation, and orderly shutdown; detached unbounded tasks are not acceptable evidence.
- A successful second handshake alone is insufficient; both sessions must make progress and observe authoritative shared state.
- SharedTree must consume accepted driver and FSP4 contracts. It must report mandatory unsupported interfaces instead of silently broadening scope.
- Node can validate actual WASM protocol/lifecycle behavior but cannot substitute for browser WebTransport or independent-session evidence.

Move to Phase 3 early if the fence or kernel must change, the second session cannot make progress under bounded task ownership, SharedTree requires private storage decoding or incompatible wire semantics, or a production driver surface becomes mandatory.
