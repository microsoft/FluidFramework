# Iteration 0006: direct-shared-tree-integration Report

Status: complete
Branch: `rust-service-iteration-0006-direct-shared-tree-integration`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0006-direct-shared-tree-integration`
Base commit: `a85dc67452af126c5cbc16c271a03f1f9c1bd33f`; accepted concurrency prerequisite through `b6d5af8c2b3`
Final commit: the commit containing this completed report and implementation; its self-referential hash is reported to the coordinator
Agent or owner: GitHub Copilot implementation agent
Model and tool version: GitHub Copilot; model and tool version unknown
Instruction source: [direct SharedTree integration instructions](instructions/direct-shared-tree-integration.md) at `a85dc67452af126c5cbc16c271a03f1f9c1bd33f`
Session or transcript reference: none
Started and finished: `2026-09-12T22:13:46+00:00` to `2026-09-12T23:36:26+00:00`

## Outcome

Implemented and ran a real SharedTree/Fluid container fixture through the generated browser WASM client, native WebTransport service, and minimal Fluid driver. Three independently loaded containers used three distinct browser transport sessions. Two live containers each committed an edit and converged; a transport-disconnected real SharedTree edit then resolved authoritatively as `notCommitted`, was resubmitted exactly once by fixture code, converged, and replayed into a third container with final value `3`.

The driver additions normalize Fluid summaries, provide valid claims and synthetic membership, translate projected FSP4 positions into a valid Fluid sequence space, serialize calls into one generated WASM client per document service, honor requested connection modes, preserve batching metadata, and expose explicit synchronization/recovery controls. No FSQ2 payload was decoded and no driver retry or reconnect loop was added. Confidence is high for the scoped forced-write, single-host browser proof and low for production-driver generality.

## Hypothesis Results

The core hypothesis is supported for create/load, bidirectional edits, convergence, initial-summary reload plus projected-op replay, disconnected `notCommitted` resolution, and caller-owned resubmission. Chromium 152 returned `status: passed`, three independent containers/sessions, final value `3`, one explicit resubmission, and projected Fluid sequences `[3,4,5]` on both live clients.

The initial hypothesis that raw projected-op delivery was sufficient was falsified. Fluid also required valid token claims, quorum/audience bootstrap, canonical summary shape, monotonic Fluid sequence/client-sequence translation, and batching metadata preservation. The default read-to-write reconnect path remains inconclusive: read-mode bootstrap is contract-tested, but the browser fixture uses the host-supported `Fluid.Container.ForceWriteConnection` gate so reconnect cursor transfer is not claimed. Committed-after-response-loss recovery is proven by the actual generated-WASM injected Node test, not by native Chromium, because the native browser transport has no deterministic response-drop hook.

## Deliverables and Commits

- Final workstream commit: real SharedTree fixture, parameterized bounded Chromium runner, focused TypeScript configuration and package declarations, narrow minimal-driver semantics, actual-WASM contract coverage, and this completed report.
- Dependencies declared from the existing workspace/catalog: Fluid container loader, core interfaces, driver definitions, Fluid Static, SharedTree, Biome `2.4.5`, esbuild `0.28.2`, and TypeScript `6.0.3`.
- No root workspace, pnpm lock, Cargo manifest/lock, Rust source, native server, kernel, sequencer, protocol, content-store, or generated WASM source file changed.

## Validation Evidence

All commands ran from `/workspaces/FluidFramework-rust-service-iteration-0006-direct-shared-tree-integration` on branch `rust-service-iteration-0006-direct-shared-tree-integration`, HEAD before the final commit `b6d5af8c2b3e1f2681e8956e6b8bcf7ef402140d`.

- `npm test` in `rust-service/tests/minimal-fluid-driver`: 3 passed, 0 failed. This executes built actual-WASM protocol, content, connection-mode, remote sequence translation, disconnected `notCommitted` resubmission, and committed ambiguity-without-resubmission coverage.
- `pnpm run check:format`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run typecheck:shared-tree`, `pnpm run build`, and `pnpm run build:shared-tree`: all passed. esbuild emitted only pre-existing package-condition ordering warnings.
- `node browser/run-headless.mjs "$PWD" https://127.0.0.1:49964/fluid fa4fd790a5269829cadaefe47f68453e0893d9034f7c92d6eea7826d792c0bca __sharedTreeResult shared-tree.html`: passed in Chromium `152.0.0.0` without insecure flags. Evidence: `transportSessionCount=3`, `independentContainerCount=3`, `finalValue=3`, `recoveryResolution=notCommitted`, `explicitResubmissionCount=1`, `projectedReads=10`, `resolutions=1`, `uploadedBlobs=20`, `fetchedBlobs=40`, `publishedSummaries=1`, `fetchedSummaries=2`, synchronized sequences `[3,4,5]` for both live clients, `wireBytes=39349`, `peakResponseBytes=4030`, and `startupMilliseconds=1829.9`.
- Protected-file diff for root `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `rust-service/Cargo.toml`, and `rust-service/Cargo.lock`: empty before the final commit.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Browser build prerequisite | Generated WebTransport bindings initially failed without `web_sys_unstable_apis`. | Fresh bindings required `RUSTFLAGS='--cfg=web_sys_unstable_apis'`. | Blocked the first browser build. | Regenerated from accepted Rust source with the required cfg. | WebTransport browser build instructions must carry the unstable web-sys cfg explicitly. |
| Fluid storage contract | Snapshot loads failed despite successful publication. | Fluid expected canonical ordering, a flattened `.app` summary shape, and valid claims. | Attach/load could not reach SharedTree. | Normalized summary paths/order and supplied complete token claims. | A storage adapter must validate framework shape, not only content round trips. |
| Fluid protocol contract | Delivered operations were ignored or rejected. | Missing joins, invalid sequence/MSN translation, remote authorship, and later duplicate remote client sequence numbers each produced distinct failures. | Required several discriminating browser runs. | Added synthetic membership, a two-message application offset, conservative MSN, and projected-order sequence numbers for the synthetic remote author. | Raw op delivery is insufficient; preserve Fluid envelope invariants without decoding DDS payloads. |
| WASM ownership | Parallel storage/delta calls raced one generated browser client. | Browser-WASM objects could not be inspected while borrowed and concurrent requests corrupted ownership. | Multiple sessions and loads were intermittent. | Memoized and serialized one generated client per document service; separate containers still use separate transports. | Serialize non-reentrant generated clients at the adapter boundary, not across independent services. |
| Connection lifecycle | The loaded peer silently stopped receiving operations. | Telemetry showed `ConnectionModeMismatch`, disposed streams, and assertion `0x4b6` from a synthetic remote inheriting read mode. | Delayed convergence and exposed an invalid audience/quorum model. | Honored requested mode, made disposal notify Fluid without closing the service-owned transport, and fixed remote write membership. The final browser proof explicitly forces write connections. | Capture connection mode and membership telemetry before changing payload translation. |
| Replay author collapse | Live convergence reached value `2`, but the third container closed with duplicate client sequence `1`. | Independent service writers mapped to one synthetic Fluid author while retaining writer-local sequence numbers. | Cold replay failed after live success. | Assigned synthetic remote client sequence numbers from authoritative projected order while preserving true local acknowledgements. | When writers are intentionally collapsed, all author-scoped monotonic fields must be translated together. |
| Harness cleanup | One successful run ended with transient `ENOTEMPTY` removing Chromium's profile. | Chromium had exited but profile cleanup still raced a file operation. | Produced noisy post-evidence failure output. | Added bounded `rm` retries. | Browser evidence harnesses need bounded teardown retries as well as bounded startup/result waits. |

## Contract and Integration Friction

Wave 2 depended on accepted native concurrency commit `694a0d6f30ed126958db2e9f1c7c0256c8bb1382`, integrated into this worktree through `b6d5af8c2b3e1f2681e8956e6b8bcf7ef402140d`. The generated browser client is structurally adapted because generated and source declarations are not nominally interchangeable. The fixture includes local source in a focused TypeScript project with `skipLibCheck` to avoid unrelated workspace declaration failures.

Signals remain unsupported and throw if invoked. Automatic polling/retry remains opt-in and disabled in the proof; synchronization, reconnect, resolution, and resubmission are explicit. The synthetic membership and collapsed remote author are sufficient for this minimal SharedTree slice, not a production Fluid driver contract. The browser proof uses `Fluid.Container.ForceWriteConnection`; default read-to-write cursor/session transfer is deferred.

## Human Interventions

The user requested parallel execution and selected native connection concurrency as the prerequisite before direct SharedTree integration. No implementation correction was supplied during this workstream.

## Measurements

- Environment: Debian GNU/Linux 13; Node `24.21.0`; pnpm `11.15.1`; TypeScript `6.0.3`; Biome `2.4.5`; esbuild `0.28.2`; Chromium `152.0.0.0`; generated `wasm-bindgen 0.2.128` package.
- Final Chromium run: 39,349 application-visible FSP4 bytes, 4,030-byte peak response, 1,829.9 ms fixture duration, three transport sessions, and three independent containers. Browser APIs do not expose QUIC/TLS/IP totals.
- Content activity: one summary publication, two summary fetches, 20 blob uploads, 40 blob fetches, ten projected reads, and one authoritative resolution.
- Fluid activity: both live clients observed translated sequences `3`, `4`, and `5`; final value `3`; one explicit resubmission after `notCommitted`.
- Wall-clock workstream interval: approximately 83 minutes. Model token use is unknown.

## Proposed Decisions

No new shared decision is proposed. The implementation preserves [Decision 0006](../../../decisions/0006-scoped-deployment-boundaries.md), [Decision 0007](../../../decisions/0007-projected-reads-and-ambiguity-recovery.md), and [Decision 0008](../../../decisions/0008-portable-wasm-client-boundary.md).

## Candidate Skills and Process Changes

Candidate browser-driver diagnostic procedure: capture stage, connection mode/disposal/checkpoint state, selected Fluid envelope metadata, and error telemetry before inspecting DDS payloads. The sequence of failures here showed that summary shape, membership, sequence space, and author-scoped monotonicity can each explain a non-converging DDS while payload bytes remain opaque.

Candidate evidence rule: retain a compact successful browser JSON payload with transport count, protocol operation counts, projected sequences, recovery result, explicit retry count, byte totals, and browser identity. Delegated summaries repeatedly omitted decisive browser fields, so direct machine-readable capture remains preferable.

## Remaining Work and Risks

- Default read-to-write reconnection needs shared cursor/checkpoint/session semantics before it can be claimed. The fixture deliberately uses Fluid's supported force-write host gate.
- Native Chromium proves deterministic disconnected-before-commit resolution and one caller-owned resubmission. Deterministic committed-after-response-loss remains actual-WASM injected Node evidence because no browser/native response-drop test hook exists.
- Signals, automatic synchronization policy, production authentication, true multi-writer Fluid membership, summarizer election, retention, offline merge, and Routerlicious/ODSP compatibility remain outside scope.
- Generated bundle, WASM package, certificates, Chromium profiles, and service data remain ignored and uncommitted. No intentional tracked artifact remains outside the files listed above.
