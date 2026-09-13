# Iteration 0007: fluid-read-reconnect-lifecycle Report

Status: complete
Branch: `rust-service-iteration-0007-fluid-read-reconnect-lifecycle`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0007-fluid-read-reconnect-lifecycle`
Base commit: `115d142fb2ba985b3c4952791498dfecfe8ac902`
Final commit: implementation `fa9187c0d93061060acdac93041e266b83403b8d`; the report-only closure commit containing this field follows it
Agent or owner: GitHub Copilot implementation agent
Model and tool version: GitHub Copilot; model unknown; tool version unknown
Instruction source: `rust-service/iterations/0007/phase-2/instructions/fluid-read-reconnect-lifecycle.md` at `115d142fb2ba985b3c4952791498dfecfe8ac902`
Session or transcript reference: `fa38fc21-1536-49e1-a614-b6e07a553ae8`
Started and finished: started `2026-09-13T01:08:31Z`; finished `2026-09-13T01:41:27Z`

## Outcome

Fluid's default read connection now upgrades to a write connection without the `Fluid.Container.ForceWriteConnection` gate. `MinimalWasmDocumentService` owns a stable logical writer, session, projected cursor, last mutation position, and deterministic operation projection across stream replacement. Submissions are buffered by Fluid client sequence number so reconnect control traffic cannot overtake an earlier pending edit. A real Chromium SharedTree trace passed remote read delivery, replacement, one edit from each client, explicit disconnected-before-commit recovery, convergence to value 3, and cold replay. Confidence is high for the tested single-host adapter contract and deliberately low for production membership semantics, which FSP4 does not expose.

## Hypothesis Results

- The initial narrow hypothesis that removing only the force-write gate would suffice was falsified: the replacement sequenced a no-op but never established its fresh writer identity in the existing synthetic quorum.
- The charter hypothesis was supported after document-service state was expanded to include stable logical-local and external projected members, a stable session/cursor/last position, memoized remote operation sequence projection shared by history and live delivery, and contiguous submission release. The passing Chromium trace is the discriminating evidence.
- The assumption that method call order equals Fluid client sequence order was falsified. On replacement Fluid submitted control CSN 2 before replaying pending edit CSN 1; buffering by client sequence restored authoritative order without retry or payload decoding.

## Deliverables and Commits

- `fa9187c0d93061060acdac93041e266b83403b8d` removes the force-write fixture gate, implements document-service lifecycle state and ordered submission, extends the generated-WASM contract, and updates the package limitations.
- The following report-only closure commit completes this record; it contains no implementation changes.

## Validation Evidence

- Exact checkout: `/workspaces/FluidFramework-rust-service-iteration-0007-fluid-read-reconnect-lifecycle`, branch `rust-service-iteration-0007-fluid-read-reconnect-lifecycle`, kickoff `115d142fb2ba985b3c4952791498dfecfe8ac902`.
- Fresh browser WASM: `CARGO_TARGET_DIR=/tmp/fluid-iteration-0007-lifecycle-wasm-target RUSTFLAGS='--cfg=web_sys_unstable_apis' cargo build --locked -p fluid-webtransport-browser --target wasm32-unknown-unknown --release`; passed. Matching `wasm-bindgen` web and Node outputs were generated from that artifact.
- Native fixture: `CARGO_TARGET_DIR=/tmp/fluid-iteration-0007-lifecycle-native-target cargo build --locked -p fluid-webtransport-native --release`; passed.
- `pnpm run check:format`; passed after one formatter correction. `pnpm run lint`, `pnpm run typecheck`, `pnpm run typecheck:shared-tree`, `pnpm run build`, `pnpm run build:shared-tree`, and `pnpm run build:benchmarks`; all passed. Esbuild reported only the existing package export-condition warnings.
- `pnpm test`; 3 passed, 0 failed, including `actual WASM package backs the minimal Fluid driver contract` with out-of-order CSN 2 then CSN 1 input proven to persist as 1 then 2.
- `node browser/run-headless.mjs "$PWD" https://127.0.0.1:39557/fluid ea923775bc422d2f725a1a9992bf406fd5977509a85afcaec363b6862dea3616 __sharedTreeResult shared-tree.html`; passed in Headless Chromium 152 without insecure flags. Result: 3 transport sessions, 3 independent containers, final value 3, `notCommitted` recovery, 1 explicit resubmission, 12 projected reads, synchronized application sequences through 5, 40,434 wire bytes, 4,157-byte peak response, and 2,112.8 ms elapsed startup-plus-trace time.
- `pnpm --silent run benchmark:rust 3 100 10 <transport-url> <certificate-hash>`; 3 of 3 samples passed. This existing benchmark arm still declares force-write and is retained only as a regression sample, not default-lifecycle performance evidence.
- `git diff --check`; passed. Root `Cargo.lock` is absent and root `pnpm-lock.yaml` has no diff.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Falsified hypothesis | Remove only `ForceWriteConnection` | Chromium reached `converging-second-edit`; a third stream sequenced traffic but the first view stayed at 1 | Exposed missing replacement membership state | Moved logical identity/session/cursor to document-service ownership | Test default lifecycle before adding recovery scope |
| Falsified hypothesis | Reuse one synthetic remote member for external and future-local operations | Chromium reported duplicate/non-increasing client sequence errors | Replacement container closed | Split logical-local and external members and memoized per-operation projection | A projected client ID needs its own contiguous CSN domain |
| Ordering defect | Sequence submissions in driver call order | Fluid sent reconnect no-op CSN 2 before pending edit CSN 1 | Local stream closed on a client-sequence gap | Buffer and release the contiguous CSN prefix | Preserve protocol order independently of callback arrival order |
| Tooling interruption | Delegated agent stopped after dependency build | Worktree retained two uncommitted files and seven unresolved report fields | Coordinator completed focused implementation and evidence | Preserved worktree and resumed from observed artifacts | Audit branch, process, log, and report state before recovering delegated work |

## Contract and Integration Friction

FSP4 does not carry Fluid join/leave membership operations. The adapter therefore projects two explicitly synthetic write members and must not claim production audience/quorum semantics. History and live delivery must share the same memoized projection or Fluid rejects duplicate sequence numbers with differing envelopes. There was no implementation dependency on native graceful shutdown; both branches remained path-disjoint.

## Human Interventions

Before kickoff, the user approved completing iteration `0007` before implementing live projected streaming. No human correction was needed inside this workstream.

## Measurements

- Chromium trace: 2,112.8 ms; 40,434 FSP4 wire bytes; 4,157-byte peak response; 3 transport sessions; 12 projected reads; 1 resolution; 1 explicit resubmission.
- Three-run existing force-write benchmark regression on Linux `6.8.0-1064-azure`, AMD EPYC 7763, 32 logical CPUs, Node `24.21.0`, Chromium `152.0.0.0`: median startup 1,075.0 ms; median throughput 13.45 ops/s; median operation latency 58.2 ms; median per-run p95 113.9 ms. Source was intentionally dirty at implementation commit and this is not retained clean benchmark evidence.
- Dependency and tracked generated-file changes: none. Root lockfiles unchanged. Observed workstream elapsed wall time: 32 minutes 56 seconds.

## Proposed Decisions

No shared decision record is proposed. The synthetic two-member projection remains an adapter limitation already bounded by the iteration charter.

## Candidate Skills and Process Changes

Candidate process addition: when recovering an interrupted workstream, first capture exact worktree/branch/HEAD, running processes, retained build log completion, modified paths, and unresolved report markers. The event above shows this avoided rebuilding completed dependencies and preserved the agent's initial experiment.

## Remaining Work and Risks

- Live projected-operation subscription remains intentionally deferred. Current synchronization is caller-driven polling over request/response streams.
- Production membership remains unsupported until the service contract exposes authoritative join/leave state; two concurrent read-first writers would share the synthetic logical-local member.
- The existing comparison benchmark still forces write mode and its backend label reflects that. Iteration `0008` should add atomic catch-up-plus-tail streaming, resume cursor, gap/duplicate handling, backpressure, cancellation tied to native shutdown, and a default-lifecycle benchmark acceptance profile.
- Ignored WASM, bundle, certificate, service data, and `/tmp` benchmark outputs are intentional local validation artifacts and are not committed.
