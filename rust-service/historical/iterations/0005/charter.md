# Iteration 0005 Charter

Status: active
Source commit: `2de3d94f89ecff3e340eb1d580d628d5d951681b`
Coordinator: GitHub Copilot primary agent with interactive user approval

## Questions and Hypotheses

1. **Projected reads and ambiguity recovery:** Can `fluid-sequencer` expose accepted operations and resolve a stable ambiguous submission through FSP4 without kernel changes or hidden retry? Disprove with a mixed administrative/operation page that skips or duplicates on resume, or a disconnect-after-commit trace that appends twice or remains unresolved while the service is live.
2. **Content-addressed blobs and summaries:** Can immutable digest-addressed blobs and atomic summary manifests survive interruption and reopen without dangling acknowledged references? Disprove with the smallest crash trace that publishes a manifest whose referenced bytes are absent, corrupt, or different.
3. **Browser-WASM package:** Can one environment-neutral WASM client API pass deterministic Node tests through an injected transport and unchanged Chromium WebTransport tests? Disprove when the same lifecycle/protocol case has divergent public outcomes or browser-only globals leak into the core.
4. **Minimal TypeScript Fluid driver:** Can a real Fluid application create, load, submit, summarize, disconnect, reconnect, and recover through the packaged client without private FSQ2 decoding? Disprove with a two-client trace that loses, duplicates, or reorders acknowledged work or cannot reload its summary blobs.

## Active Workstreams

- **Wave 1, projected-reads-ambiguity-recovery:** owns sequencer projection and the first shared protocol/service/client handoff. It stops on required kernel semantics, position ordering, hidden retry, or unresolved cross-writer authorization.
- **Wave 1 core / Wave 2 protocol, content-addressed-blobs-summaries:** initially owns a new isolated blob/summary core. It waits for the projected-protocol handoff before editing FSP4/service/client paths. It stops if acknowledgement can expose dangling references or correctness requires retention policy.
- **Wave 1 package / Wave 2 consumption, browser-wasm-client-package:** initially owns transport injection, bindings, Node harness, and browser adapter paths against current FSP4. It consumes both accepted protocol handoffs before final API validation. It stops on divergent Node/browser semantics or mock-only transport evidence.
- **Wave 3, minimal-typescript-fluid-driver:** may map interfaces and scaffold tests early but does not implement around invented contracts. It consumes all three accepted prerequisites and owns only its new TypeScript package/example and focused harnesses. It stops on private FSQ2 decoding, hidden retry, or claims beyond the implemented Fluid interfaces.

All worktrees start from the same kickoff commit. Prerequisites enter dependent branches through coordinator-recorded cherry-picks without rebasing. Integration owns root workspace/package registration, shared lockfiles, cross-workstream conflict resolution, and final validation.

## Deferred Scope

Retention/GC and browser storage wait for blob references, summary reachability, and the driver contract. Direct SharedTree integration waits for the general driver evidence. Service concurrency must not weaken the accepted fence to unblock this vertical slice. Distributed fencing, hardware power-loss qualification, cloud blob stores, authentication/authorization, production certificate automation, Node WebTransport, fallback transports, offline-first merge, and broad optimization remain outside the single-host prototype questions.

## Shared Validation

From `rust-service/`, integration runs:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo build --workspace --all-targets
cargo test --workspace --all-targets --all-features
cargo run -p snapshotted-stream-counter
node ../.github/skills/rust-service-coordination/scripts/iteration-records.mjs validate 0005 phase-2
```

WASM work additionally runs `cargo clippy` and `cargo build` for `wasm32-unknown-unknown`, binding/package generation, Node package tests that load the built WASM, and a fresh headless Chromium trace without insecure flags. The driver runs the repository-standard TypeScript formatting, lint, typecheck, and test commands for its selected package plus the two-client browser trace. Blob/summary and recovery paths require fault/process tests. Every applicable Rust implementation runs shared conformance. Workstreams use isolated targets and exact disposable copies when they do not own root registration or lockfiles.

## Risks and Escalation

- Shared FSP4 edits are serialized by handoff; dependent work must not invent provisional wire values independently.
- Projection must progress across administrative-only canonical spans without exposing FSQ2 or looping on one opaque cursor.
- Ambiguity resolution must remain idempotent across lost responses and restart and must not authorize another writer's submission.
- Summary acknowledgement must not precede durable availability of all referenced blobs; retention is explicitly unavailable as a workaround.
- Node mocks must execute real package framing and lifecycle code. Chromium remains mandatory for WebTransport, certificate, stream, and reconnect claims.
- The driver must report unsupported Fluid interfaces rather than broadening scope silently.

Move to Phase 3 early if a kernel change is required, two consumers require incompatible protocol semantics, a published summary can dangle, browser and Node APIs diverge, or the driver needs private canonical decoding or hidden retry.
