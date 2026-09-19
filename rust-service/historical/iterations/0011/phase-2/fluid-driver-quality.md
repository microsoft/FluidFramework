# Iteration 0011: fluid-driver-quality Report

Status: complete
Branch: `rust-service-iteration-0011-fluid-driver-quality`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0011-fluid-driver-quality`
Base commit: `c3d0aeb25bcd347af9742391cac1d809ab45f4a7`
Final implementation commit: `838db7e5821f6c52c54c4c4c364b8fd8408e37c0`
Report finalization commit: the commit containing this provenance update; exact SHA returned to the coordinator
Agent or owner: GitHub Copilot
Model and tool version: unknown
Instruction source: [`instructions/fluid-driver-quality.md`](instructions/fluid-driver-quality.md) at `c3d0aeb25bcd347af9742391cac1d809ab45f4a7`
Session or transcript reference: none
Started and finished: started `2026-09-13T18:38:45+00:00`; finished `2026-09-13T21:57:58+00:00`

## Outcome

Added an injected TypeScript submission-stream fixture and deterministic coverage for ordering, acknowledgements, write and response failure, reconnect and recovery, explicit resubmission, subscription cursor restart, synchronization, disconnect, disposal, and unary fallback. Two defects were reproduced and fixed: the serializing client wrapper discarded the optional stream capability, making streaming unreachable, and delta-connection lifecycle transitions orphaned submission streams. Confidence is high for the internal driver state machine and unary fallback, with generated-WASM integration and SharedTree typechecking limited by absent ignored/generated packages.

## Hypothesis Results

- **Supported:** the existing internal `SubmissionStream` and `WasmProtocolClient` boundaries support deterministic lifecycle testing without generated binding, Fluid API, protocol, dependency, Rust, or benchmark changes. All nine injected lifecycle tests pass.
- **Reproduced and fixed:** `SerializedWasmProtocolClient` did not forward `openSubmissionStream`, so a stream-capable injected client observed zero opened streams and submission silently used unary requests. The initial test failed `0 !== 1`; conditional forwarding now preserves structural absence for unary-only clients while stream-capable clients open one stream.
- **Reproduced and fixed:** reconnect and disposal did orphan opened submission streams. The lifecycle test observed `closeCount` `0 !== 1`; disconnect, reconnect, and disposal now close the owned stream, and reconnect stops its prior subscription before opening replacements.
- **Supported:** pending identities survive stream write and response failures across reconnect. `recoverPending()` distinguishes `notCommitted` from `committed`, and only the former is explicitly resubmitted through unary fallback.

### Lifecycle inventory

| Lifecycle state or transition | Deterministic result |
| --- | --- | --- |
| Queued writes | Held acknowledgements show stream writes `[1, 2]` and pending keys `[1, 2]`. |
| Ordered responses | Releasing acknowledgements removes pending keys in order, then `waitForIdle()` resolves. |
| Write failure | Injected `send()` rejection propagates from `waitForIdle()` and remains `notCommitted` after reconnect. |
| Read/response failure | Injected `next()` rejection after commit propagates and resolves `committed` after reconnect. |
| Reconnect | Old stream closes, old subscription cancels, and one replacement of each opens. |
| `recoverPending` | Deterministically covers both `notCommitted` and `committed` outcomes after streamed failures and reconnect. |
| `resubmitPending` | A `notCommitted` operation resubmits through unary request kind 3; committed work is not resubmitted. |
| Subscription restart/cursor | Restart cancels the prior subscription and resumes from `cursor-1`. |
| Synchronization | Explicit read advances the cursor, emits projected sequence 3, and subsequent push emits sequence 4. |
| Disconnect and disposal | Each closes its stream and cancels its subscription; repeated lifecycle paths do not double-own resources. |
| Unary fallback | A client structurally lacking `openSubmissionStream` uses request kinds `[2, 3]` and opens no stream. |

## Deliverables and Commits

- `src/fluidDriver.test.ts`: injected stream/subscription/client fixture and nine deterministic lifecycle tests.
- `src/fluidDriver.ts`: conditional forwarding of stream capability plus explicit stream/subscription cleanup.
- `README.md`: supported submission/subscription lifecycle, ambiguity workflow, unary fallback, limitations, setup, and test-fixture documentation.
- This report: provenance, lifecycle inventory, hypotheses, failures, validation, and residual risks.
- Implementation commit: `838db7e5821f6c52c54c4c4c364b8fd8408e37c0` (`test(rust-service): harden minimal Fluid driver lifecycle`).

## Validation Evidence

- Checkout identity: worktree `/workspaces/FluidFramework-rust-service-iteration-0011-fluid-driver-quality`; branch `rust-service-iteration-0011-fluid-driver-quality`; initial HEAD `c3d0aeb25bcd347af9742391cac1d809ab45f4a7`.
- Environment: Node.js `v22.23.2`; pnpm `11.15.1`.
- `pnpm run check:format`: exit 0; 21 files checked, no fixes required after formatting the two touched TypeScript files.
- `pnpm run lint`: exit 0; 18 files checked, no diagnostics.
- `pnpm run build`: exit 0; `tsc --project tsconfig.json` completed without diagnostics.
- `node_modules/.bin/tsc --project tsconfig.json --noEmit`: exit 0, no diagnostics; equivalent to `pnpm run typecheck` after the package script process was repeatedly interrupted by concurrent terminal activity.
- `pnpm test`: exit 1; 12 tests executed, 11 passed and 1 failed. All nine new lifecycle tests and both protocol-client tests passed. The existing generated-WASM contract test was blocked by `MODULE_NOT_FOUND` for `rust-service/tests/wasm-client/pkg/fluid_webtransport_browser.js`; the assigned worktree contains no ignored generated package, and generating it would require the prohibited Rust/generated-binding path.
- `node_modules/.bin/tsc --project tsconfig.shared-tree.json`: exit 2 with six dependency-resolution errors: `@fluidframework/local-driver/internal`, `@fluidframework/local-driver/legacy`, `@fluidframework/server-local-server`, two imports of `../pkg/fluid_webtransport_browser.js`, and `../pkg-local/fluid_native_service_browser.js`. These declarations/generated packages are absent in the isolated worktree and outside this workstream's writable scope.
- The exact esbuild commands from `build:benchmark:rust`, `build:benchmark:local`, and `build:benchmark:tinylicious` each exited 0. Generated `dist/` output was removed after validation.
- Focused bundled lifecycle run: 9 tests, 9 passed, 0 failed; approximately 90 ms on Node.js `v22.23.2`.
- VS Code diagnostics: no errors in `src/fluidDriver.ts` or `src/fluidDriver.test.ts`.
- `git diff --check`: exit 0.
- Temporary `node_modules` symlinks plus generated `lib/`, `dist/`, and `tsconfig.tsbuildinfo` validation artifacts were removed. Lockfiles and generated `pkg/`/`pkg-local/` directories were not changed.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Provenance correction | The generated report named branch `rust-service/iteration-0011/fluid-driver-quality`, while the assigned and checked-out branch is `rust-service-iteration-0011-fluid-driver-quality`. | `git branch --show-current`; initial HEAD `c3d0aeb25bcd347af9742391cac1d809ab45f4a7`. | Report corrected before implementation. | Resolved. | Treat observed worktree metadata as authoritative, per the coordination skill. |
| Reproduced defect | Added a stream-capable fake client through the document-service factory. | `document service preserves injected submission streaming` failed because opened stream count was `0`, expected `1`; unary request kind 3 was used instead. | The production streaming path was unreachable through the wrapper. | Added conditional `openSubmissionStream` forwarding; test passes while unary-only clients retain fallback. | Optional capabilities must be forwarded structurally, not implemented as methods that return `undefined`, especially with `exactOptionalPropertyTypes`. |
| Reproduced defect | Asserted resource counts across reconnect and disposal. | `reconnect and disposal close submission streams and cancel subscriptions` failed because old stream close count was `0`, expected `1`. | Reconnect and teardown leaked transport stream ownership. | Added idempotent stream stop and paired it with subscription stop on disconnect, reconnect, and disposal; test passes. | Every transport resource opened by a connection needs an explicit symmetric lifecycle transition. |
| Validation interference | Repeated shared terminal and delegated runs returned output from unrelated iteration worktrees or were externally interrupted with exit 130. | Outputs named `fluid-service-quality`, `examples-benchmarks-quality`, and other branches; interrupted scripts did not write requested status files. | Invalid outputs were discarded; validation took substantial extra effort. | Used short isolated commands, unique temporary logs, output identity checks, and direct package-declared tool commands. | Multi-worktree validation needs process-level terminal isolation in addition to branch/path sentinels. |

## Contract and Integration Friction

The generated-WASM injected transport fixture does not currently expose submission streaming, so the streaming lifecycle is tested at the existing internal `WasmProtocolClient` boundary. The generated-WASM unary contract remains blocked locally by its absent ignored package. No public Fluid API, protocol, generated binding, dependency, benchmark, Rust crate, or lockfile changed.

## Human Interventions

None.

## Measurements

- Functional test duration: focused nine-test bundle approximately 90 ms under Node.js `v22.23.2`.
- Performance and wire-size measurements: not applicable; no benchmark workload was executed or changed.
- Dependency change: none.
- Scope: three package files plus this report; no lockfile, generated binding, benchmark source, dependency, or Rust change.

## Proposed Decisions

No shared decision is proposed. The fixes preserve existing public APIs, protocol encoding, and unary fallback semantics.

## Candidate Skills and Process Changes

Candidate process change: allocate an isolated execution terminal per concurrent worktree agent. Require every retained command result to include or be paired with verified absolute worktree and branch identity; discard output naming another worktree even when the execution wrapper reports success.

## Remaining Work and Risks

- Generate `rust-service/tests/wasm-client/pkg/` in an owning workstream and rerun `pnpm test` to cover the existing generated-WASM unary contract. Do not hand-create or commit that ignored package.
- Build the local-driver/server declarations and generate this package's `pkg/` and `pkg-local/` bindings in owning workflows, then rerun `pnpm run typecheck:shared-tree`.
- The injected fixture validates the TypeScript state machine, not generated binding implementation details or a live transport's stream-close behavior.
- Fluid `disconnect()` and `dispose()` are synchronous interfaces while resource cleanup is asynchronous; tests observe eventual close/cancel completion, but callers cannot await it through the public interface.
- Confidence is high for ordering, pending-state transitions, reconnect/recovery/resubmit behavior, cursor restart, synchronization, resource disposal, and unary fallback within the minimal driver boundary.
